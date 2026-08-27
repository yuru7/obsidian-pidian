import { Notice, Plugin, type ViewCreator, type WorkspaceLeaf } from "obsidian";
import { AgentService } from "./application/AgentService";
import { t } from "./i18n";
import { ContextService } from "./application/ContextService";
import { CredentialResolver } from "./application/CredentialResolver";
import { InstructionProvider } from "./application/InstructionProvider";
import { PermissionService } from "./application/PermissionService";
import { ReadRevisionTracker } from "./application/ReadRevisionTracker";
import { SessionCleanupService } from "./application/SessionCleanupService";
import { SessionService } from "./application/SessionService";
import { PiAgentAdapter } from "./infrastructure/pi/PiAgentAdapter";
import { envApiKeyForProvider } from "./infrastructure/pi/PiCredentials";
import { PiModelCatalog } from "./infrastructure/pi/PiModelCatalog";
import { editorContextExtension } from "./infrastructure/obsidian/editorContextExtension";
import { ObsidianContextProvider } from "./infrastructure/obsidian/ObsidianContextProvider";
import { ObsidianInstructionReader } from "./infrastructure/obsidian/ObsidianInstructionReader";
import { ObsidianNoteEditor } from "./infrastructure/obsidian/ObsidianNoteEditor";
import { ObsidianNoteRepository } from "./infrastructure/obsidian/ObsidianNoteRepository";
import { ObsidianPermissionPrompter } from "./infrastructure/obsidian/ObsidianPermissionPrompter";
import { ObsidianSessionRepository } from "./infrastructure/obsidian/ObsidianSessionRepository";
import { DEFAULT_SETTINGS, mergeSettings, type PidianSettings } from "./settings/Settings";
import { PidianSettingTab } from "./settings/PidianSettingTab";
import { createPidianTools } from "./tools/createPidianTools";
import { PIDIAN_ICON_ID } from "./ui/pidianIcon";
import { PidianView, VIEW_TYPE_PIDIAN } from "./ui/PidianView";

export default class PidianPlugin extends Plugin {
  settings: PidianSettings = DEFAULT_SETTINGS;
  agentService?: AgentService;
  sessionService?: SessionService;
  modelCatalog?: PiModelCatalog;
  private noteEditor?: ObsidianNoteEditor;
  private readonly editorContextListeners = new Set<() => void>();

  async onload(): Promise<void> {
    await this.loadSettings();

    // Settings first (Copilot does this), then services, then views/ribbon.
    // Views are always registered even if agent init fails.
    this.addSettingTab(new PidianSettingTab(this.app, this));

    try {
      this.initServices();
    } catch (error) {
      console.error("Pidian: failed to initialize agent services", error);
      new Notice(t("noticeAgentFailed"));
    }

    this.safeRegisterView(VIEW_TYPE_PIDIAN, (leaf) => new PidianView(leaf, this));
    try {
      this.addRibbonIcon(PIDIAN_ICON_ID, t("commandOpen"), () => {
        void this.activateView();
      });
    } catch (error) {
      console.warn("Pidian: failed to add ribbon icon", error);
    }
    this.addCommand({
      id: "open-pidian",
      name: t("commandOpen"),
      icon: PIDIAN_ICON_ID,
      callback: () => {
        void this.activateView();
      },
    });
    this.addCommand({
      id: "new-pidian-chat",
      name: t("commandNewChat"),
      icon: PIDIAN_ICON_ID,
      callback: () => {
        void this.activateView().then(() => this.startNewChat());
      },
    });

    this.app.workspace.onLayoutReady(() => {
      if (this.app.workspace.getLeavesOfType(VIEW_TYPE_PIDIAN).length === 0) {
        void this.activateView();
      }
      if (this.agentService) {
        void this.bootstrap();
      }
    });
  }

  onunload(): void {
    this.noteEditor?.dispose();
    this.editorContextListeners.clear();
  }

  subscribeEditorContext(listener: () => void): () => void {
    this.editorContextListeners.add(listener);
    return () => {
      this.editorContextListeners.delete(listener);
    };
  }

  private notifyEditorContext(): void {
    for (const listener of this.editorContextListeners) {
      listener();
    }
  }

  private initServices(): void {
    const notes = new ObsidianNoteRepository(this.app);
    const editor = new ObsidianNoteEditor(this.app, () => this.settings.maxEditableNotes);
    this.noteEditor = editor;
    const sessions = new SessionService(new ObsidianSessionRepository(this.app));
    this.sessionService = sessions;
    const tracker = new ReadRevisionTracker();
    const permissions = new PermissionService(
      () => this.settings.permissions,
      new ObsidianPermissionPrompter(this.app),
    );
    const credentials = new CredentialResolver({
      getSetting: (providerId) => this.settings.apiKeys[providerId],
      getEnv: (providerId) => {
        const custom = this.settings.customProviders.find((item) => item.id === providerId);
        if (custom?.apiKey.trim()) {
          return undefined;
        }
        return envApiKeyForProvider(providerId);
      },
    });
    const adapter = new PiAgentAdapter({
      credentials,
      getCustomProviders: () => this.settings.customProviders,
    });
    this.modelCatalog = new PiModelCatalog(
      () => adapter.getRuntime(),
      () => this.settings.customProviders,
    );
    const contextProvider = new ObsidianContextProvider(this.app);
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        contextProvider.rememberCurrentMarkdown();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        contextProvider.rememberCurrentMarkdown();
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      contextProvider.rememberCurrentMarkdown();
    });
    this.registerEditorExtension(
      editorContextExtension(() => {
        this.notifyEditorContext();
      }),
    );
    this.agentService = new AgentService(
      adapter,
      sessions,
      new ContextService(contextProvider, () => this.settings.includeSelectionContext),
      new InstructionProvider(() => new ObsidianInstructionReader(this.app).read()),
      (sessionId) =>
        createPidianTools({
          sessionId,
          notes,
          editor,
          permissions,
          tracker,
        }),
    );
  }

  private safeRegisterView(type: string, viewCreator: ViewCreator): void {
    try {
      this.registerView(type, viewCreator);
    } catch (error) {
      console.warn(`Pidian: view type "${type}" already registered; skipping re-registration.`, error);
    }
  }

  private async bootstrap(): Promise<void> {
    await this.resolveDefaultModel();
    await this.startNewChat();
    await this.cleanupSessions();
  }

  private async resolveDefaultModel(): Promise<void> {
    try {
      const catalog = this.modelCatalog;
      if (!catalog) {
        return;
      }
      const providers = await catalog.listProviders();
      if (providers.length === 0) {
        return;
      }
      const hasProvider = providers.some((provider) => provider.id === this.settings.provider);
      const provider = hasProvider ? this.settings.provider : providers[0]?.id;
      if (!provider) {
        return;
      }
      const models = await catalog.listModels(provider);
      const hasModel = models.some((model) => model.id === this.settings.model);
      this.settings.provider = provider;
      if (!hasModel) {
        this.settings.model = models[0]?.id ?? "";
      }
      await this.saveSettings();
    } catch {
      // Catalog may be unavailable until credentials exist.
    }
  }

  async startNewChat(): Promise<void> {
    if (!this.agentService) {
      new Notice(t("noticeNotInitialized"));
      return;
    }
    await this.agentService.newChat(this.settings.provider, this.settings.model);
    const error = this.agentService.getError();
    if (error) {
      new Notice(t("noticeError", { error }));
    }
  }

  async openSession(id: string): Promise<void> {
    if (!this.agentService) {
      new Notice(t("noticeNotInitialized"));
      return;
    }
    try {
      await this.agentService.openChat(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t("noticeError", { error: message }));
    }
  }

  async changeModel(provider: string, model: string): Promise<void> {
    this.settings.provider = provider;
    this.settings.model = model;
    await this.saveSettings();
    if (this.agentService?.getSession()) {
      await this.agentService.setModel(provider, model);
    }
  }

  async activateView(): Promise<void> {
    const leaf = this.resolvePidianLeaf();
    if (!leaf) {
      new Notice(t("noticeSidebarFailed"));
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_PIDIAN, active: false });
    await this.app.workspace.revealLeaf(leaf);
  }

  private resolvePidianLeaf(): WorkspaceLeaf | null {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PIDIAN)[0];
    if (existing) {
      return existing;
    }
    return this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getRightLeaf(true) ?? this.app.workspace.getLeaf(true);
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    this.syncCustomProviderKeys();
  }

  async saveSettings(): Promise<void> {
    this.syncCustomProviderKeys();
    await this.saveData(this.settings);
  }

  private syncCustomProviderKeys(): void {
    for (const provider of this.settings.customProviders) {
      if (provider.apiKey.trim()) {
        this.settings.apiKeys[provider.id] = provider.apiKey;
      }
    }
  }

  private async cleanupSessions(): Promise<void> {
    if (!this.agentService) {
      return;
    }
    const cleanup = new SessionCleanupService(new ObsidianSessionRepository(this.app));
    await cleanup.cleanup({
      enabled: this.settings.autoDeleteSessions,
      retentionDays: this.settings.retentionDays,
      activeSessionId: this.agentService.getSession()?.id,
    });
  }
}
