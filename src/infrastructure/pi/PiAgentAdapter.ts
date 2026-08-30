import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { clampThinkingLevel, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import type { Api, Model, ModelsStore } from "@earendil-works/pi-ai";
import type { AgentConversation } from "../../domain/agent/AgentConversation";
import type { AgentEngine, AgentSessionOptions } from "../../domain/agent/AgentEngine";
import type { AgentEventListener } from "../../domain/agent/AgentEvent";
import type { AgentPrompt, AgentSession } from "../../domain/agent/AgentSession";
import { isThinkingLevel } from "../../domain/agent/thinkingLevel";
import {
  customProviderModelIds,
  isConfiguredCustomProvider,
  type CustomOpenAIProvider,
} from "../../settings/Settings";
import { CredentialResolver } from "../../application/CredentialResolver";
import { injectCorsFreeFetch, withCorsFreeFetch } from "./corsFreeFetch";
import { PidianResourceLoader } from "./PidianResourceLoader";
import { normalizeAgentsContent, pidianAgentsFiles } from "./pidianAgentsFiles";
import { PIDIAN_SYSTEM_PROMPT } from "./PiCredentials";
import { mapPiEvent } from "./PiEventMapper";
import { toPiTools } from "./PiToolAdapter";

const MODEL_CATALOG_REFRESH_TIMEOUT_MS = 15_000;

export interface PiAgentAdapterOptions {
  credentials: CredentialResolver;
  getCustomProviders: () => CustomOpenAIProvider[];
  readAgentsFile: () => Promise<string | undefined>;
  modelsStore?: ModelsStore;
  shouldRefreshDynamicCatalog?: () => Promise<boolean>;
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
      this.runtimePromise = this.createRuntime();
    }
    return this.runtimePromise;
  }

  private async createRuntime(): Promise<ModelRuntime> {
    const runtime = injectCorsFreeFetch(
      await ModelRuntime.create({
        modelsPath: null,
        modelsStore: this.options.modelsStore,
        // Do not read ~/.pi/agent/auth.json. Keys come from settings and env.
        credentials: new InMemoryCredentialStore(),
        allowModelNetwork: false,
        refreshOnCreate: false,
      }),
    );
    this.registerCustomProviders(runtime);
    await this.applyCredentials(runtime);
    const allowNetwork = this.options.shouldRefreshDynamicCatalog
      ? await this.options.shouldRefreshDynamicCatalog()
      : true;
    await this.refreshDynamicCatalog(runtime, allowNetwork);
    return runtime;
  }

  private async refreshDynamicCatalog(runtime: ModelRuntime, allowNetwork: boolean): Promise<void> {
    try {
      const result = await withCorsFreeFetch(() =>
        runtime.refresh({
          allowNetwork,
          force: allowNetwork,
          signal: AbortSignal.timeout(MODEL_CATALOG_REFRESH_TIMEOUT_MS),
        }),
      );
      if (result.aborted) {
        console.warn("Pidian: model catalog refresh timed out or was aborted");
      }
      for (const [providerId, error] of result.errors) {
        console.warn(`Pidian: model catalog refresh failed for ${providerId}`, error);
      }
    } catch (error) {
      console.warn("Pidian: model catalog refresh failed", error);
    }
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    const runtime = await this.getRuntime();
    this.registerCustomProviders(runtime);
    await this.applyCredentials(runtime);

    const model = runtime.getModel(options.provider, options.model);
    if (!model) {
      throw new Error(`Unknown model ${options.provider}/${options.model}. Check Settings.`);
    }

    const thinkingLevel = isThinkingLevel(options.thinkingLevel)
      ? clampThinkingLevel(model, options.thinkingLevel)
      : undefined;
    const agentsContent = normalizeAgentsContent(await this.options.readAgentsFile());
    const settingsManager = SettingsManager.inMemory();
    const loader = new PidianResourceLoader({
      systemPrompt: PIDIAN_SYSTEM_PROMPT,
      agentsFiles: pidianAgentsFiles(agentsContent),
    });

    const { session } = await createAgentSession({
      model,
      thinkingLevel,
      modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(),
      settingsManager,
      resourceLoader: loader as unknown as ResourceLoader,
      noTools: "builtin",
      customTools: toPiTools(options.tools),
    });

    if (options.conversation && options.conversation.messages.length > 0) {
      session.agent.state.messages = toPiMessages(
        options.conversation,
        model,
      ) as unknown as typeof session.agent.state.messages;
    }

    return new PiWrappedSession(session);
  }

  private async applyCredentials(runtime: ModelRuntime): Promise<void> {
    const customById = new Map(this.options.getCustomProviders().map((provider) => [provider.id, provider]));
    const providerIds = new Set<string>([
      ...runtime.getProviders().map((provider) => provider.id),
      ...customById.keys(),
    ]);
    for (const providerId of providerIds) {
      const resolved = this.options.credentials.resolve(providerId);
      const custom = customById.get(providerId);
      if (resolved.source === "none" && !custom) {
        try {
          await runtime.removeRuntimeApiKey(providerId);
        } catch {
          // Provider may not support runtime keys.
        }
        continue;
      }
      const apiKey = resolved.source === "none" ? customApiKey(custom) : resolved.apiKey;
      await runtime.setRuntimeApiKey(providerId, apiKey);
    }
  }

  private registerCustomProviders(runtime: ModelRuntime): void {
    for (const provider of this.options.getCustomProviders()) {
      if (!isConfiguredCustomProvider(provider)) {
        continue;
      }
      try {
        runtime.unregisterProvider(provider.id);
      } catch {
        // Not registered yet.
      }
      runtime.registerProvider(provider.id, {
        name: provider.name.trim() || provider.id,
        baseUrl: provider.baseUrl.trim(),
        apiKey: customApiKey(provider),
        api: "openai-completions",
        models: customProviderModelIds(provider).map((modelId) => ({
          id: modelId,
          name: modelId,
          reasoning: false,
          input: ["text"],
          contextWindow: 128000,
          maxTokens: 8192,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      });
    }
  }
}

type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

class PiWrappedSession implements AgentSession {
  constructor(private readonly session: PiSession) {}

  async prompt(request: AgentPrompt): Promise<void> {
    await this.session.prompt(request.text, { expandPromptTemplates: false });
    const errorMessage = this.session.agent.state.errorMessage;
    if (errorMessage) {
      throw new Error(errorMessage);
    }
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

function customApiKey(provider: CustomOpenAIProvider | undefined): string {
  const key = provider?.apiKey.trim();
  return key || "local";
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
