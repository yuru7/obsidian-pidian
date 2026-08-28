import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentConversation } from "../../domain/agent/AgentConversation";
import type { AgentEngine, AgentSessionOptions } from "../../domain/agent/AgentEngine";
import type { AgentEventListener } from "../../domain/agent/AgentEvent";
import type { AgentPrompt, AgentSession } from "../../domain/agent/AgentSession";
import type { CustomOpenAIProvider } from "../../settings/Settings";
import { CredentialResolver } from "../../application/CredentialResolver";
import { injectCorsFreeFetch } from "./corsFreeFetch";
import { normalizeAgentsContent, pidianAgentsFiles } from "./pidianAgentsFiles";
import { PIDIAN_SYSTEM_PROMPT } from "./PiCredentials";
import { mapPiEvent } from "./PiEventMapper";
import { toPiTools } from "./PiToolAdapter";

export interface PiAgentAdapterOptions {
  credentials: CredentialResolver;
  getCustomProviders: () => CustomOpenAIProvider[];
  readAgentsFile: () => Promise<string | undefined>;
}

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export class PiAgentAdapter implements AgentEngine {
  private runtimePromise?: Promise<ModelRuntime>;

  constructor(private readonly options: PiAgentAdapterOptions) {}

  getRuntime(): Promise<ModelRuntime> {
    if (!this.runtimePromise) {
      this.runtimePromise = ModelRuntime.create({
        allowModelNetwork: false,
        refreshOnCreate: false,
      }).then(injectCorsFreeFetch);
    }
    return this.runtimePromise;
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    const runtime = await this.getRuntime();
    await this.applyCredentials(runtime);
    this.registerCustomProviders(runtime);

    const model = runtime.getModel(options.provider, options.model);
    if (!model) {
      throw new Error(`Unknown model ${options.provider}/${options.model}. Check Settings.`);
    }

    const agents = { content: normalizeAgentsContent(await this.options.readAgentsFile()) };
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(),
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => PIDIAN_SYSTEM_PROMPT,
      agentsFilesOverride: () => ({
        agentsFiles: pidianAgentsFiles(agents.content),
      }),
    });
    await loader.reload();

    const { session } = await createAgentSession({
      model,
      modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      resourceLoader: loader,
      noTools: "builtin",
      customTools: toPiTools(options.tools),
    });

    if (options.conversation && options.conversation.messages.length > 0) {
      session.agent.state.messages = toPiMessages(
        options.conversation,
        model,
      ) as unknown as typeof session.agent.state.messages;
    }

    return new PiWrappedSession(session, loader, agents, this.options.readAgentsFile);
  }

  private async applyCredentials(runtime: ModelRuntime): Promise<void> {
    const providerIds = new Set<string>([
      ...runtime.getProviders().map((provider) => provider.id),
      ...this.options.getCustomProviders().map((provider) => provider.id),
    ]);
    for (const providerId of providerIds) {
      const resolved = this.options.credentials.resolve(providerId);
      if (resolved.source === "none") {
        try {
          await runtime.removeRuntimeApiKey(providerId);
        } catch {
          // Provider may not support runtime keys.
        }
        continue;
      }
      await runtime.setRuntimeApiKey(providerId, resolved.apiKey);
    }
  }

  private registerCustomProviders(runtime: ModelRuntime): void {
    for (const provider of this.options.getCustomProviders()) {
      try {
        runtime.unregisterProvider(provider.id);
      } catch {
        // Not registered yet.
      }
      runtime.registerProvider(provider.id, {
        name: provider.name,
        baseUrl: provider.baseUrl,
        api: "openai-completions",
        models: [
          {
            id: provider.modelId,
            name: provider.modelId,
            reasoning: false,
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      });
    }
  }
}

type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

class PiWrappedSession implements AgentSession {
  constructor(
    private readonly session: PiSession,
    private readonly loader: DefaultResourceLoader,
    private readonly agents: { content: string | undefined },
    private readonly readAgentsFile: () => Promise<string | undefined>,
  ) {}

  async prompt(request: AgentPrompt): Promise<void> {
    await this.syncAgentsFile();
    await this.session.prompt(request.text, { expandPromptTemplates: false });
    const errorMessage = this.session.agent.state.errorMessage;
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }

  private async syncAgentsFile(): Promise<void> {
    const next = normalizeAgentsContent(await this.readAgentsFile());
    if (next === this.agents.content) {
      return;
    }
    this.agents.content = next;
    await this.loader.reload();
    this.session.setActiveToolsByName(this.session.getActiveToolNames());
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  subscribe(listener: AgentEventListener): () => void {
    return this.session.subscribe((event) => {
      const mapped = mapPiEvent(event);
      if (mapped) {
        listener(mapped);
      }
    });
  }

  async dispose(): Promise<void> {
    this.session.dispose();
  }
}

function toPiMessages(conversation: AgentConversation, model: Model<Api>): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const message of conversation.messages) {
    if (message.role === "user") {
      messages.push({
        role: "user",
        content: message.text,
        timestamp: Date.parse(message.createdAt) || Date.now(),
      });
      continue;
    }

    const content: Array<Record<string, unknown>> = [];
    if (message.thinking) {
      content.push({ type: "thinking", thinking: message.thinking });
    }
    if (message.text) {
      content.push({ type: "text", text: message.text });
    }
    for (const toolCall of message.toolCalls ?? []) {
      content.push({
        type: "toolCall",
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.args && typeof toolCall.args === "object" ? toolCall.args : {},
      });
    }
    messages.push({
      role: "assistant",
      content,
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: EMPTY_USAGE,
      stopReason: (message.toolCalls?.length ?? 0) > 0 ? "toolUse" : "stop",
      timestamp: Date.parse(message.createdAt) || Date.now(),
    });
    for (const toolCall of message.toolCalls ?? []) {
      messages.push({
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: "text", text: toolCall.result ?? "" }],
        isError: Boolean(toolCall.isError),
        timestamp: Date.parse(message.createdAt) || Date.now(),
      });
    }
  }
  return messages;
}
