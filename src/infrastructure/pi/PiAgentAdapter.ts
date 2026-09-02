import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import type { ModelsStore } from "@earendil-works/pi-ai";
import type { AgentEngine, AgentSessionOptions } from "../../domain/agent/AgentEngine";
import type { AgentEventListener } from "../../domain/agent/AgentEvent";
import type { AgentPrompt, AgentSession } from "../../domain/agent/AgentSession";
import type {
  SubscriptionAuth,
  SubscriptionLoginInteraction,
  SubscriptionProvider,
} from "../../domain/agent/SubscriptionAuth";
import { isThinkingLevel } from "../../domain/agent/thinkingLevel";
import {
  customModelDisplayName,
  customProviderModels,
  isConfiguredCustomProvider,
  type CustomOpenAIProvider,
  type StoredOAuthCredential,
} from "../../settings/Settings";
import { CredentialResolver, credentialRuntimePlan } from "../../application/CredentialResolver";
import {
  ENABLED_SUBSCRIPTION_PROVIDERS,
  isEnabledSubscriptionProvider,
} from "../../application/subscriptionProviders";
import { injectCorsFreeFetch, withCorsFreeFetch } from "./corsFreeFetch";
import { createCustomRequestBodyFetch } from "./customRequestBody";
import { PidianCredentialStore } from "./PidianCredentialStore";
import { PidianResourceLoader } from "./PidianResourceLoader";
import { normalizeAgentsContent, pidianAgentsFiles } from "./pidianAgentsFiles";
import { pidianSystemPrompt } from "./PiCredentials";
import { mapPiCompactionEvent, mapPiEvent } from "./PiEventMapper";
import { hydratePiSession } from "./piSessionHydration";
import { toPiTools } from "./PiToolAdapter";
import { toPiAuthInteraction } from "./subscriptionLogin";
import { modelSupportsImages, toolsVisibleToModel } from "./visionModel";
import "./registerBundledOAuth";

const MODEL_CATALOG_REFRESH_TIMEOUT_MS = 15_000;

export interface PiAgentAdapterOptions {
  credentials: CredentialResolver;
  getCustomProviders: () => CustomOpenAIProvider[];
  getOAuthCredentials: () => Record<string, StoredOAuthCredential>;
  persistOAuthCredentials: (next: Record<string, StoredOAuthCredential>) => Promise<void>;
  readAgentsFile: () => Promise<string | undefined>;
  modelsStore?: ModelsStore;
  shouldRefreshDynamicCatalog?: () => Promise<boolean>;
}

export class PiAgentAdapter implements AgentEngine, SubscriptionAuth {
  private runtimePromise?: Promise<ModelRuntime>;
  private readonly credentialStore: PidianCredentialStore;

  constructor(private readonly options: PiAgentAdapterOptions) {
    this.credentialStore = new PidianCredentialStore({
      load: options.getOAuthCredentials,
      persist: options.persistOAuthCredentials,
    });
  }

  listEnabled(): readonly SubscriptionProvider[] {
    return ENABLED_SUBSCRIPTION_PROVIDERS;
  }

  hasSession(providerId: string): boolean {
    return Boolean(this.options.getOAuthCredentials()[providerId]);
  }

  async login(providerId: string, interaction: SubscriptionLoginInteraction): Promise<void> {
    if (!isEnabledSubscriptionProvider(providerId)) {
      throw new Error(`Subscription login is not enabled for ${providerId}`);
    }
    const runtime = await this.getRuntime();
    await this.applyCredentials(runtime);
    await withCorsFreeFetch(
      () => runtime.login(providerId, "oauth", toPiAuthInteraction(interaction)),
      createCustomRequestBodyFetch(this.options.getCustomProviders),
    );
  }

  async logout(providerId: string): Promise<void> {
    if (!isEnabledSubscriptionProvider(providerId)) {
      throw new Error(`Subscription login is not enabled for ${providerId}`);
    }
    const runtime = await this.getRuntime();
    await runtime.logout(providerId);
  }

  getRuntime(): Promise<ModelRuntime> {
    if (!this.runtimePromise) {
      this.runtimePromise = this.createRuntime();
    }
    return this.runtimePromise;
  }

  private async createRuntime(): Promise<ModelRuntime> {
    const fetch = createCustomRequestBodyFetch(this.options.getCustomProviders);
    const runtime = injectCorsFreeFetch(
      await ModelRuntime.create({
        modelsPath: null,
        modelsStore: this.options.modelsStore,
        // Do not read ~/.pi/agent/auth.json. Keys and OAuth stay in plugin data.
        credentials: this.credentialStore,
        allowModelNetwork: false,
        refreshOnCreate: false,
      }),
      fetch,
    );
    this.registerCustomProviders(runtime);
    await this.applyCredentials(runtime);
    const allowNetwork = this.options.shouldRefreshDynamicCatalog
      ? await this.options.shouldRefreshDynamicCatalog()
      : true;
    await this.refreshDynamicCatalog(runtime, allowNetwork, fetch);
    return runtime;
  }

  private async refreshDynamicCatalog(
    runtime: ModelRuntime,
    allowNetwork: boolean,
    fetch = createCustomRequestBodyFetch(this.options.getCustomProviders),
  ): Promise<void> {
    try {
      const result = await withCorsFreeFetch(
        () =>
          runtime.refresh({
            allowNetwork,
            force: allowNetwork,
            signal: AbortSignal.timeout(MODEL_CATALOG_REFRESH_TIMEOUT_MS),
          }),
        fetch,
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
    const supportsImages = modelSupportsImages(model);
    const loader = new PidianResourceLoader({
      systemPrompt: pidianSystemPrompt(supportsImages),
      agentsFiles: pidianAgentsFiles(agentsContent),
    });
    const sessionManager = SessionManager.inMemory();
    if (options.conversation && options.conversation.messages.length > 0) {
      hydratePiSession(sessionManager, options.conversation, model);
    }

    const { session } = await createAgentSession({
      model,
      thinkingLevel,
      modelRuntime: runtime,
      sessionManager,
      settingsManager,
      resourceLoader: loader as unknown as ResourceLoader,
      noTools: "builtin",
      customTools: toPiTools(toolsVisibleToModel(options.tools, model)),
    });

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
      const plan = credentialRuntimePlan(resolved, custom ? customApiKey(custom) : undefined);
      if (plan.action === "set") {
        await runtime.setRuntimeApiKey(providerId, plan.apiKey);
        continue;
      }
      try {
        await runtime.removeRuntimeApiKey(providerId);
      } catch {
        // Provider may not support runtime keys. OAuth stays in the credential store.
      }
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
        models: customProviderModels(provider).map((model) => ({
          id: model.id,
          name: customModelDisplayName(model),
          reasoning: false,
          input: model.supportsImages ? ["text", "image"] : ["text"],
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
    await withCorsFreeFetch(() => this.session.prompt(request.text, { expandPromptTemplates: false }));
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
      const compaction = mapPiCompactionEvent(event, this.session.sessionManager.getBranch());
      if (compaction) {
        listener(compaction);
        return;
      }
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
