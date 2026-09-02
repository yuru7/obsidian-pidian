import { Notice, PluginSettingTab, Setting, setIcon, setTooltip, displayTooltip, normalizePath, TFile, type App } from "obsidian";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import type { CatalogModel, CatalogProvider } from "../domain/agent/ModelCatalog";
import { clampThinkingLevel, formatModelSelectionLabel, hasSelectableThinkingLevels, parseOptionalThinkingLevel } from "../domain/agent/thinkingLevel";
import type { Permission } from "../domain/permissions/Permission";
import { DEFAULT_PLUGIN_DIRECTORY, agentsFilePath, isValidPluginDirectory, normalizeNotePath } from "../application/notePath";
import { listKnownCredentialProviders } from "../infrastructure/pi/PiCredentials";
import { ObsidianWorkspaceNavigator } from "../infrastructure/obsidian/ObsidianWorkspaceNavigator";
import { addFavorite, moveFavorite, removeFavoriteById, type ModelFavorite } from "./modelFavorites";
import { parseExtraRequestBody } from "../infrastructure/pi/customRequestBody";
import {
  createEmptyCustomProviderModel,
  fillModelSettingNameFromId,
  isDuplicateCustomProviderName,
  isDuplicateModelSettingName,
  uniqueCustomProviderName,
  DEFAULT_SETTINGS,
  parseSessionFileFormat,
  type CustomOpenAIProvider,
  type CustomProviderModel,
} from "./Settings";

const RETENTION_PRESETS = new Set(["7", "30", "90"]);

type SettingsTabId = "general" | "favorites" | "permissions" | "apiAuth" | "session";

type FavoriteDraft = { provider: string; model: string; thinkingLevel?: string };

function permissionOptions(): Array<{ value: Permission; label: string }> {
  return [
    { value: "allow", label: t("settingsPermissionAllow") },
    { value: "ask", label: t("settingsPermissionAsk") },
    { value: "deny", label: t("settingsPermissionDeny") },
  ];
}

function quotedEnvVarNames(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

function usingEnvDescription(name: string): DocumentFragment {
  return createFragment((root) => {
    const wrap = root.createSpan({ cls: "pidian-settings-using-env" });
    const icon = wrap.createSpan({ cls: "pidian-settings-env-check" });
    icon.setAttr("aria-hidden", "true");
    setIcon(icon, "check");
    wrap.createSpan({ text: t("settingsEnvSet", { name }) });
  });
}

function sortProviders(providers: CatalogProvider[]): CatalogProvider[] {
  return [...providers].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
}

function settingsTabs(): Array<{ id: SettingsTabId; label: string }> {
  return [
    { id: "general", label: t("settingsTabGeneral") },
    { id: "favorites", label: t("settingsTabFavorites") },
    { id: "permissions", label: t("settingsTabPermissions") },
    { id: "apiAuth", label: t("settingsTabApiAuth") },
    { id: "session", label: t("settingsTabSession") },
  ];
}

export class PidianSettingTab extends PluginSettingTab {
  private customRetentionSelected = false;
  private selectedTab: SettingsTabId = "general";
  private lastRenderedTab: SettingsTabId | null = null;
  private favoriteDraft: FavoriteDraft | null = null;
  private favoriteDraftOpen = false;
  private favoriteDragFrom: number | null = null;
  private expandedFavoriteIds = new Set<string>();
  private expandedCustomModelJson = new Set<string>();

  constructor(
    app: App,
    private readonly plugin: PidianPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const sameTab = this.lastRenderedTab === this.selectedTab;
    const scrollTop = sameTab ? this.readSettingsScroll() : 0;
    containerEl.empty();
    this.renderTabs(containerEl);

    const panel = containerEl.createDiv({ cls: "pidian-settings-panel" });
    panel.setAttr("role", "tabpanel");
    panel.id = "pidian-settings-panel";
    panel.setAttr("aria-labelledby", `pidian-settings-tab-${this.selectedTab}`);
    this.renderSelected(this.selectedTab, panel);

    this.lastRenderedTab = this.selectedTab;
    if (sameTab) {
      this.writeSettingsScroll(scrollTop);
    }
  }

  hide(): void {
    this.customRetentionSelected = false;
    this.favoriteDraft = null;
    this.favoriteDraftOpen = false;
    this.favoriteDragFrom = null;
    this.expandedFavoriteIds.clear();
    this.expandedCustomModelJson.clear();
    super.hide();
  }

  private renderTabs(containerEl: HTMLElement): void {
    const tablist = containerEl.createDiv({ cls: "pidian-settings-tablist" });
    tablist.setAttr("role", "tablist");
    for (const tab of settingsTabs()) {
      const selected = tab.id === this.selectedTab;
      const button = tablist.createEl("button", {
        cls: selected ? "pidian-settings-tab is-active" : "pidian-settings-tab",
        text: tab.label,
        attr: {
          type: "button",
          role: "tab",
          id: `pidian-settings-tab-${tab.id}`,
          "aria-selected": selected ? "true" : "false",
          "aria-controls": "pidian-settings-panel",
        },
      });
      button.addEventListener("click", () => {
        if (this.selectedTab === tab.id) {
          return;
        }
        this.selectedTab = tab.id;
        this.display();
      });
    }
  }

  private renderGeneral(containerEl: HTMLElement): void {
    const agentEl = containerEl.createDiv();
    const fallbackProviders = this.fallbackProviders();
    const fallbackModels = this.fallbackModels(this.plugin.settings.model);
    this.renderAgent(agentEl, this.selectableProviders(fallbackProviders), fallbackModels);
    this.renderOther(containerEl);
    void this.enrichAgentFromCatalog(agentEl);
  }

  private renderFavorites(containerEl: HTMLElement): void {
    const panel = containerEl.createDiv();
    const fallback = this.fallbackFavoriteCatalog();
    this.renderFavoritesContent(panel, fallback.providers, fallback.modelsByProvider);
    void this.enrichFavoritesFromCatalog(panel);
  }

  private fallbackFavoriteCatalog(): { providers: CatalogProvider[]; modelsByProvider: Record<string, CatalogModel[]> } {
    const providers = this.selectableProviders(this.fallbackProviders());
    const modelsByProvider: Record<string, CatalogModel[]> = {};
    for (const favorite of this.plugin.settings.modelFavorites) {
      modelsByProvider[favorite.provider] = this.modelsWithFallback(
        favorite.provider,
        modelsByProvider[favorite.provider] ?? [],
        favorite.model,
      );
    }
    if (this.favoriteDraft) {
      modelsByProvider[this.favoriteDraft.provider] = this.modelsWithFallback(
        this.favoriteDraft.provider,
        modelsByProvider[this.favoriteDraft.provider] ?? [],
        this.favoriteDraft.model,
      );
    }
    return { providers, modelsByProvider };
  }

  private modelsWithFallback(providerId: string, models: CatalogModel[], modelId: string): CatalogModel[] {
    if (!modelId || models.some((item) => item.id === modelId)) {
      return models;
    }
    return [{ id: modelId, name: modelId, providerId, thinkingLevels: [] }, ...models];
  }

  private providersWithFallback(providers: CatalogProvider[], providerId: string): CatalogProvider[] {
    if (!providerId || providers.some((item) => item.id === providerId)) {
      return providers;
    }
    return [{ id: providerId, name: providerId, envVarNames: [] }, ...providers];
  }

  private async enrichFavoritesFromCatalog(containerEl: HTMLElement): Promise<void> {
    const catalog = this.plugin.modelCatalog;
    if (!catalog) {
      return;
    }
    try {
      const listed = await catalog.listProviders();
      const providers = listed.length > 0 ? listed : this.selectableProviders(this.fallbackProviders());
      const ids = new Set<string>();
      for (const favorite of this.plugin.settings.modelFavorites) {
        ids.add(favorite.provider);
      }
      if (this.favoriteDraft?.provider) {
        ids.add(this.favoriteDraft.provider);
      }
      const modelsByProvider: Record<string, CatalogModel[]> = {};
      await Promise.all(
        [...ids].map(async (id) => {
          modelsByProvider[id] = await catalog.listModels(id).catch(() => []);
        }),
      );
      if (!containerEl.isConnected) {
        return;
      }
      containerEl.empty();
      this.renderFavoritesContent(containerEl, providers, modelsByProvider);
    } catch (error) {
      if (!containerEl.isConnected) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      containerEl.createEl("p", {
        cls: "setting-item-description",
        text: t("settingsCatalogError", { message }),
      });
    }
  }

  private renderFavoritesContent(
    containerEl: HTMLElement,
    providers: CatalogProvider[],
    modelsByProvider: Record<string, CatalogModel[]>,
  ): void {
    const toolbar = containerEl.createDiv({ cls: "pidian-favorite-toolbar" });
    const newButton = toolbar.createEl("button", { text: t("settingsFavoriteNew") });
    newButton.addEventListener("click", () => {
      this.openFavoriteDraft();
    });
    if (this.favoriteDraftOpen) {
      this.renderFavoriteDraft(containerEl, providers, modelsByProvider);
    }
    const favorites = this.plugin.settings.modelFavorites;
    if (favorites.length === 0) {
      if (!this.favoriteDraftOpen) {
        containerEl.createEl("p", {
          cls: "setting-item-description",
          text: t("settingsFavoritesEmpty"),
        });
      }
      return;
    }
    const list = containerEl.createDiv({ cls: "pidian-favorite-list" });
    list.addEventListener("dragover", (event) => {
      if (this.favoriteDragFrom !== null) {
        event.preventDefault();
      }
    });
    list.addEventListener("drop", (event) => {
      event.preventDefault();
    });
    favorites.forEach((favorite, index) => {
      this.renderFavoriteItem(list, favorite, index, providers, modelsByProvider);
    });
  }

  private openFavoriteDraft(): void {
    this.favoriteDraftOpen = true;
    this.favoriteDraft = {
      provider: this.plugin.settings.provider,
      model: this.plugin.settings.model,
      thinkingLevel: this.plugin.settings.thinkingLevel,
    };
    this.refreshSettings();
  }

  private renderFavoriteItem(
    containerEl: HTMLElement,
    favorite: ModelFavorite,
    index: number,
    providers: CatalogProvider[],
    modelsByProvider: Record<string, CatalogModel[]>,
  ): void {
    const wrap = containerEl.createDiv({ cls: "pidian-favorite-item" });
    wrap.dataset.index = String(index);
    const expanded = this.expandedFavoriteIds.has(favorite.id);
    wrap.toggleClass("is-expanded", expanded);
    this.bindFavoriteDrag(wrap, index);

    const header = wrap.createDiv({ cls: "pidian-favorite-item-header" });
    const handle = header.createEl("span", {
      cls: "pidian-favorite-drag-handle",
      attr: {
        draggable: "true",
        title: t("settingsFavoriteReorder"),
        "aria-label": t("settingsFavoriteReorder"),
      },
    });
    setIcon(handle, "grip-vertical");
    handle.addEventListener("dragstart", (event) => {
      this.favoriteDragFrom = index;
      event.dataTransfer?.setData("text/plain", String(index));
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
      wrap.addClass("is-dragging");
    });
    handle.addEventListener("dragend", () => {
      this.favoriteDragFrom = null;
      wrap.removeClass("is-dragging");
      containerEl.querySelectorAll(".pidian-favorite-item").forEach((item) => {
        item.removeClass("is-drop-before");
        item.removeClass("is-drop-after");
      });
    });

    const providerName = this.providersWithFallback(providers, favorite.provider).find((item) => item.id === favorite.provider)?.name
      ?? favorite.provider;
    const models = this.modelsWithFallback(favorite.provider, modelsByProvider[favorite.provider] ?? [], favorite.model);
    const modelName = models.find((item) => item.id === favorite.model)?.name ?? favorite.model;
    const thinkingLevels = models.find((item) => item.id === favorite.model)?.thinkingLevels ?? [];
    const thinking = hasSelectableThinkingLevels(thinkingLevels)
      ? clampThinkingLevel(favorite.thinkingLevel, thinkingLevels)
      : undefined;
    const title = header.createEl("button", {
      cls: "pidian-favorite-item-title",
      attr: {
        type: "button",
        "aria-expanded": expanded ? "true" : "false",
      },
    });
    title.createSpan({ cls: "pidian-caret", attr: { "aria-hidden": "true" } });
    title.createSpan({
      cls: "pidian-favorite-item-title-text",
      text: formatModelSelectionLabel(providerName, modelName, thinking),
    });
    title.addEventListener("click", () => {
      if (this.expandedFavoriteIds.has(favorite.id)) {
        this.expandedFavoriteIds.delete(favorite.id);
      } else {
        this.expandedFavoriteIds.add(favorite.id);
      }
      const nextExpanded = this.expandedFavoriteIds.has(favorite.id);
      wrap.toggleClass("is-expanded", nextExpanded);
      title.setAttr("aria-expanded", nextExpanded ? "true" : "false");
    });
    const remove = header.createEl("button", {
      cls: "clickable-icon pidian-favorite-item-remove",
      attr: {
        type: "button",
        "aria-label": t("settingsFavoriteRemove"),
      },
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", () => {
      this.expandedFavoriteIds.delete(favorite.id);
      void this.saveFavorites(removeFavoriteById(this.plugin.settings.modelFavorites, favorite.id));
    });

    const body = wrap.createDiv({ cls: "pidian-favorite-item-body" });
    this.renderSelectionDropdowns(body, favorite, this.providersWithFallback(providers, favorite.provider), models, async (next) => {
      favorite.provider = next.provider;
      favorite.model = next.model;
      const nextThinking = parseOptionalThinkingLevel(next.thinkingLevel);
      if (nextThinking) {
        favorite.thinkingLevel = nextThinking;
      } else {
        delete favorite.thinkingLevel;
      }
      await this.plugin.saveSettings();
      this.refreshSettings();
    });
  }

  private bindFavoriteDrag(wrap: HTMLElement, index: number): void {
    wrap.addEventListener(
      "dragover",
      (event) => {
        if (this.favoriteDragFrom === null) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        const rect = wrap.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        wrap.toggleClass("is-drop-before", !after);
        wrap.toggleClass("is-drop-after", after);
      },
      true,
    );
    wrap.addEventListener("dragleave", (event) => {
      const related = event.relatedTarget;
      if (related instanceof Node && wrap.contains(related)) {
        return;
      }
      wrap.removeClass("is-drop-before");
      wrap.removeClass("is-drop-after");
    });
    wrap.addEventListener(
      "drop",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = this.favoriteDragFrom;
        this.favoriteDragFrom = null;
        wrap.removeClass("is-drop-before");
        wrap.removeClass("is-drop-after");
        wrap.removeClass("is-dragging");
        if (from === null) {
          return;
        }
        const rect = wrap.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        let to = after ? index + 1 : index;
        if (from < to) {
          to -= 1;
        }
        void this.saveFavorites(moveFavorite(this.plugin.settings.modelFavorites, from, to));
      },
      true,
    );
  }

  private renderFavoriteDraft(
    containerEl: HTMLElement,
    providers: CatalogProvider[],
    modelsByProvider: Record<string, CatalogModel[]>,
  ): void {
    const draft = this.favoriteDraft;
    if (!draft) {
      return;
    }
    const section = containerEl.createDiv({ cls: "pidian-favorite-new" });
    const providerList = this.providersWithFallback(providers, draft.provider);
    const models = this.modelsWithFallback(draft.provider, modelsByProvider[draft.provider] ?? [], draft.model);
    this.renderSelectionDropdowns(section, draft, providerList, models, (next) => {
      this.favoriteDraft = next;
      this.refreshSettings();
    });
    new Setting(section)
      .addButton((button) => {
        button.setButtonText(t("settingsFavoriteCancel")).onClick(() => {
          this.cancelFavoriteDraft();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("settingsFavoriteAdd")).onClick(() => {
          void this.addDraftFavorite();
        });
      });
  }

  private cancelFavoriteDraft(): void {
    this.favoriteDraftOpen = false;
    this.favoriteDraft = null;
    this.refreshSettings();
  }

  private async addDraftFavorite(): Promise<void> {
    const draft = this.favoriteDraft;
    if (!draft) {
      return;
    }
    const next = addFavorite(this.plugin.settings.modelFavorites, draft);
    if (!next) {
      new Notice(t("settingsFavoriteDuplicate"));
      return;
    }
    this.favoriteDraftOpen = false;
    this.favoriteDraft = null;
    await this.saveFavorites(next);
  }

  private async saveFavorites(favorites: ModelFavorite[]): Promise<void> {
    this.plugin.settings.modelFavorites = favorites;
    await this.plugin.saveSettings();
    this.refreshSettings();
  }

  private renderSelectionDropdowns(
    containerEl: HTMLElement,
    selection: FavoriteDraft,
    providers: CatalogProvider[],
    models: CatalogModel[],
    onChange: (next: FavoriteDraft) => void | Promise<void>,
  ): void {
    new Setting(containerEl)
      .setName(t("settingsProvider"))
      .addDropdown((dropdown) => {
        for (const provider of sortProviders(providers)) {
          dropdown.addOption(provider.id, provider.name);
        }
        dropdown.setValue(selection.provider);
        dropdown.onChange(async (value) => {
          const catalog = this.plugin.modelCatalog;
          const nextModels = catalog ? await catalog.listModels(value).catch(() => []) : [];
          const first = nextModels[0];
          const thinkingLevels = first?.thinkingLevels ?? [];
          const thinking = hasSelectableThinkingLevels(thinkingLevels)
            ? clampThinkingLevel(selection.thinkingLevel, thinkingLevels)
            : undefined;
          await onChange({ provider: value, model: first?.id ?? "", thinkingLevel: thinking });
        });
      });

    const modelOptions = models.length > 0 ? models : this.fallbackModels(selection.model);
    const modelSetting = new Setting(containerEl).setName(t("settingsModel"));
    addModelSelect(modelSetting.controlEl, modelOptions, selection.model, async (value) => {
      const selected = modelOptions.find((item) => item.id === value);
      const thinkingLevels = selected?.thinkingLevels ?? [];
      const thinking = hasSelectableThinkingLevels(thinkingLevels)
        ? clampThinkingLevel(selection.thinkingLevel, thinkingLevels)
        : undefined;
      await onChange({ provider: selection.provider, model: value, thinkingLevel: thinking });
    });

    const selectedModel = modelOptions.find((item) => item.id === selection.model);
    const thinkingLevels = selectedModel?.thinkingLevels ?? [];
    if (hasSelectableThinkingLevels(thinkingLevels)) {
      const thinking = clampThinkingLevel(selection.thinkingLevel, thinkingLevels);
      new Setting(containerEl)
        .setName(t("settingsThinkingLevel"))
        .addDropdown((dropdown) => {
          for (const level of thinkingLevels) {
            dropdown.addOption(level, level);
          }
          dropdown.setValue(thinking ?? "");
          dropdown.onChange(async (value) => {
            await onChange({ provider: selection.provider, model: selection.model, thinkingLevel: value });
          });
        });
    }
  }

  private renderApiAuth(containerEl: HTMLElement): void {
    this.renderCredentials(containerEl, this.fallbackProviders());
    this.renderFirecrawl(containerEl);
    this.renderCustomProviders(containerEl);
  }

  private renderFirecrawl(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("settingsFirecrawl")).setHeading();
    new Setting(containerEl)
      .setName(t("settingsFirecrawlApiKey"))
      .setDesc(t("settingsFirecrawlApiKeyDesc"))
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder(t("settingsFirecrawlApiKeyPlaceholder"));
        text.setValue(this.plugin.settings.firecrawlApiKey);
        text.onChange(async (value) => {
          this.plugin.settings.firecrawlApiKey = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private readSettingsScroll(): number {
    return Math.max(this.containerEl.scrollTop, this.containerEl.parentElement?.scrollTop ?? 0);
  }

  private writeSettingsScroll(scrollTop: number): void {
    const apply = (): void => {
      this.containerEl.scrollTop = scrollTop;
      const parent = this.containerEl.parentElement;
      if (parent) {
        parent.scrollTop = scrollTop;
      }
    };
    apply();
    window.requestAnimationFrame(apply);
  }

  private refreshSettings(): void {
    this.display();
  }

  private renderSelected(tab: SettingsTabId, containerEl: HTMLElement): void {
    switch (tab) {
      case "general":
        this.renderGeneral(containerEl);
        break;
      case "favorites":
        this.renderFavorites(containerEl);
        break;
      case "permissions":
        this.renderPermissions(containerEl);
        break;
      case "apiAuth":
        this.renderApiAuth(containerEl);
        break;
      case "session":
        this.renderSession(containerEl);
        break;
    }
  }

  private fallbackProviders(): CatalogProvider[] {
    const known = listKnownCredentialProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      envVarNames: provider.envVarNames,
    }));
    const custom = this.plugin.settings.customProviders.map((provider) => ({
      id: provider.id,
      name: provider.name,
      envVarNames: [] as string[],
      isCustom: true,
    }));
    const current = this.plugin.settings.provider;
    if (current && ![...known, ...custom].some((provider) => provider.id === current)) {
      known.unshift({ id: current, name: current, envVarNames: [] });
    }
    return [...known, ...custom];
  }

  private selectableProviders(providers: CatalogProvider[]): CatalogProvider[] {
    const credentials = this.plugin.credentials;
    if (!credentials) {
      return providers;
    }
    return providers.filter((provider) => provider.isCustom || credentials.hasCredential(provider.id));
  }

  private fallbackModels(modelId: string): CatalogModel[] {
    if (!modelId) {
      return [];
    }
    return [{ id: modelId, name: modelId, providerId: this.plugin.settings.provider, thinkingLevels: [] }];
  }

  private async enrichAgentFromCatalog(agentEl: HTMLElement): Promise<void> {
    const catalog = this.plugin.modelCatalog;
    if (!catalog) {
      agentEl.createEl("p", {
        cls: "setting-item-description",
        text: t("settingsCatalogMissing"),
      });
      return;
    }
    try {
      const providers = await catalog.listProviders();
      const models = this.plugin.settings.provider
        ? await catalog.listModels(this.plugin.settings.provider)
        : [];
      if (!agentEl.isConnected) {
        return;
      }
      agentEl.empty();
      this.renderAgent(
        agentEl,
        providers.length > 0 ? providers : this.selectableProviders(this.fallbackProviders()),
        models,
      );
    } catch (error) {
      if (!agentEl.isConnected) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      agentEl.createEl("p", {
        cls: "setting-item-description",
        text: t("settingsCatalogError", { message }),
      });
    }
  }

  private renderAgent(containerEl: HTMLElement, providers: CatalogProvider[], models: CatalogModel[]): void {
    new Setting(containerEl).setName(t("settingsAgent")).setHeading();

    new Setting(containerEl)
      .setName(t("settingsProvider"))
      .setDesc(t("settingsProviderDesc"))
      .addDropdown((dropdown) => {
        for (const provider of sortProviders(providers)) {
          dropdown.addOption(provider.id, provider.name);
        }
        dropdown.setValue(this.plugin.settings.provider);
        dropdown.onChange(async (value) => {
          const catalog = this.plugin.modelCatalog;
          const nextModels = catalog ? await catalog.listModels(value).catch(() => []) : [];
          const first = nextModels[0];
          await this.applyAgentSelection(value, first?.id ?? "", first?.thinkingLevels ?? []);
          this.refreshSettings();
        });
      });

    const modelOptions = models.length > 0 ? models : this.fallbackModels(this.plugin.settings.model);
    const modelSetting = new Setting(containerEl)
      .setName(t("settingsModel"))
      .setDesc(t("settingsModelDesc"));
    addModelSelect(modelSetting.controlEl, modelOptions, this.plugin.settings.model, async (value) => {
      const selected = modelOptions.find((item) => item.id === value);
      await this.applyAgentSelection(this.plugin.settings.provider, value, selected?.thinkingLevels ?? []);
      this.refreshSettings();
    });

    const selectedModel = modelOptions.find((item) => item.id === this.plugin.settings.model);
    const thinkingLevels = selectedModel?.thinkingLevels ?? [];
    if (hasSelectableThinkingLevels(thinkingLevels)) {
      const thinking = clampThinkingLevel(this.plugin.settings.thinkingLevel, thinkingLevels);
      new Setting(containerEl)
        .setName(t("settingsThinkingLevel"))
        .setDesc(t("settingsThinkingLevelDesc"))
        .addDropdown((dropdown) => {
          for (const level of thinkingLevels) {
            dropdown.addOption(level, level);
          }
          dropdown.setValue(thinking ?? "");
          dropdown.onChange(async (value) => {
            await this.plugin.changeModel(this.plugin.settings.provider, this.plugin.settings.model, value);
          });
        });
    }

    this.renderAgentInstructions(containerEl);
  }

  private renderAgentInstructions(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t("settingsAgentInstructions"))
      .setDesc(t("settingsAgentInstructionsDesc"))
      .addButton((button) => {
        button.setButtonText(t("settingsOpenAgentsMd")).onClick(() => {
          void this.openAgentsFile();
        });
      });
  }

  private async openAgentsFile(): Promise<void> {
    try {
      const path = normalizePath(agentsFilePath(this.plugin.settings.pluginDirectory));
      const file = await this.ensureAgentsFile(path);
      const result = await new ObsidianWorkspaceNavigator(this.app).openFile(file.path);
      this.closeSettingsWindow();
      const leaf = this.app.workspace.getLeafById(result.tab.id);
      if (leaf) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t("noticeError", { error: message }));
    }
  }

  private closeSettingsWindow(): void {
    // App.setting is the settings modal. It is not in the public App typings, and
    // SettingTab.hide() only unloads this tab. Closing the modal is required to
    // return keyboard focus to the workspace. If close() is removed later,
    // opening AGENTS.md still works; the settings window just stays open.
    const setting = (this.app as App & { setting?: { close?: () => void } }).setting;
    if (typeof setting?.close === "function") {
      setting.close();
    }
  }

  private async ensureAgentsFile(path: string): Promise<TFile> {
    const existing = this.app.vault.getFileByPath(path);
    if (existing) {
      return existing;
    }
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (folder) {
      await this.ensureVaultFolder(folder);
    }
    return this.app.vault.create(path, "");
  }

  private async ensureVaultFolder(folder: string): Promise<void> {
    const parts = folder.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async applyAgentSelection(
    provider: string,
    model: string,
    thinkingLevels: readonly string[],
  ): Promise<void> {
    const thinking = clampThinkingLevel(this.plugin.settings.thinkingLevel, thinkingLevels);
    await this.plugin.changeModel(provider, model, thinking);
  }

  private renderCustomProviders(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("settingsCustomProviders")).setHeading();
    for (const provider of this.plugin.settings.customProviders) {
      this.renderCustomProvider(containerEl, provider);
    }
    new Setting(containerEl).setClass("pidian-add-provider").addButton((button) => {
      button.setButtonText(t("settingsAddProvider")).onClick(async () => {
        this.plugin.settings.customProviders.push({
          id: `custom-${crypto.randomUUID()}`,
          name: uniqueCustomProviderName(
            t("settingsCustomProviderDefaultName"),
            this.plugin.settings.customProviders,
            reservedProviderNames(),
          ),
          baseUrl: "http://localhost:11434/v1",
          models: [createEmptyCustomProviderModel()],
          apiKey: "",
        });
        await this.plugin.saveSettings();
        this.refreshSettings();
      });
    });
  }

  private renderCredentials(containerEl: HTMLElement, providers: CatalogProvider[]): void {
    containerEl.createEl("p", {
      text: t("settingsCredentialsHelp"),
    });
    for (const provider of sortProviders(providers.filter((item) => !item.isCustom))) {
      const envNames = provider.envVarNames;
      const usedEnvName = envNames.find((name) => Boolean(process.env[name]?.trim()));
      const usingEnv = !this.plugin.settings.apiKeys[provider.id]?.trim() && Boolean(usedEnvName);
      new Setting(containerEl)
        .setClass("pidian-credential-setting")
        .setName(provider.name)
        .setDesc(
          usingEnv && usedEnvName
            ? usingEnvDescription(usedEnvName)
            : envNames.length > 0
              ? t("settingsEnvAvailable", { names: quotedEnvVarNames(envNames) })
              : t("settingsApiKey"),
        )
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder(t("settingsApiKey")).setValue(this.plugin.settings.apiKeys[provider.id] ?? "");
          text.onChange(async (value) => {
            this.plugin.settings.apiKeys[provider.id] = value;
            await this.plugin.saveSettings();
          });
        });
    }
  }

  private renderPermissions(containerEl: HTMLElement): void {
    this.permissionSetting(containerEl, t("settingsPermissionRead"), "read");
    this.permissionSetting(containerEl, t("settingsPermissionEdit"), "edit");
    this.permissionSetting(containerEl, t("settingsPermissionCreate"), "create");
    this.permissionSetting(containerEl, t("settingsPermissionDelete"), "delete");
    this.permissionSetting(containerEl, t("settingsPermissionWebSearch"), "webSearch");
    this.renderReset(containerEl);
  }

  private renderReset(containerEl: HTMLElement): void {
    const wrap = containerEl.createDiv({ cls: "pidian-settings-reset" });
    new Setting(wrap)
      .setName(t("settingsReset"))
      .setDesc(t("settingsResetDesc"))
      .addButton((button) => {
        button.setButtonText(t("settingsReset")).onClick(() => {
          void this.resetPermissions();
        });
      });
  }

  private async resetPermissions(): Promise<void> {
    this.plugin.settings.permissions = { ...DEFAULT_SETTINGS.permissions };
    await this.plugin.saveSettings();
    this.refreshSettings();
    new Notice(t("settingsResetDone"));
  }

  private isCustomRetention(): boolean {
    return this.customRetentionSelected || !RETENTION_PRESETS.has(String(this.plugin.settings.retentionDays));
  }

  private renderOther(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("settingsOther")).setHeading();
    new Setting(containerEl)
      .setName(t("settingsSendWithCtrlEnter"))
      .setDesc(t("settingsSendWithCtrlEnterDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.sendWithCtrlEnter);
        toggle.onChange(async (value) => {
          this.plugin.settings.sendWithCtrlEnter = value;
          await this.plugin.saveSettings();
        });
      });
    this.renderPluginDirectory(containerEl);
  }

  private renderPluginDirectory(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t("settingsPluginDirectory"))
      .setDesc(t("settingsPluginDirectoryDesc"))
      .addText((text) => {
        text.setPlaceholder(DEFAULT_PLUGIN_DIRECTORY);
        text.setValue(this.plugin.settings.pluginDirectory);
        text.onChange(async (value) => {
          const normalized = normalizeNotePath(value).replace(/\/+$/, "");
          if (!isValidPluginDirectory(normalized)) {
            return;
          }
          this.plugin.settings.pluginDirectory = normalized;
          await this.plugin.saveSettings();
        });
        text.inputEl.addEventListener("blur", () => {
          text.setValue(this.plugin.settings.pluginDirectory);
        });
      });
  }

  private renderSession(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t("settingsSessionFileFormat"))
      .setDesc(t("settingsSessionFileFormatDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("jsonl.md", ".jsonl.md");
        dropdown.addOption("jsonl", ".jsonl");
        dropdown.setValue(this.plugin.settings.sessionFileFormat);
        dropdown.onChange(async (value) => {
          this.plugin.settings.sessionFileFormat = parseSessionFileFormat(value);
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl).setName(t("settingsAutoDeleteHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("settingsSessionCountLimit"))
      .setDesc(t("settingsSessionCountLimitDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.limitSessionCount);
        toggle.onChange(async (value) => {
          this.plugin.settings.limitSessionCount = value;
          await this.plugin.saveSettings();
          this.refreshSettings();
        });
      });
    if (this.plugin.settings.limitSessionCount) {
      new Setting(containerEl).setName(t("settingsMaxSessionCount")).addText((text) => {
        text.setValue(String(this.plugin.settings.maxSessionCount));
        text.onChange(async (value) => {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed <= 0) {
            return;
          }
          this.plugin.settings.maxSessionCount = parsed;
          await this.plugin.saveSettings();
        });
      });
    }
    new Setting(containerEl)
      .setName(t("settingsAutoDelete"))
      .setDesc(t("settingsAutoDeleteDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoDeleteSessions);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoDeleteSessions = value;
          await this.plugin.saveSettings();
          this.refreshSettings();
        });
      });

    if (this.plugin.settings.autoDeleteSessions) {
      const retentionWrap = containerEl.createDiv();
      const customEl = retentionWrap.createDiv();
      new Setting(retentionWrap).setName(t("settingsRetentionDays")).addDropdown((dropdown) => {
        dropdown.addOption("7", "7");
        dropdown.addOption("30", "30");
        dropdown.addOption("90", "90");
        dropdown.addOption("custom", t("settingsRetentionCustom"));
        dropdown.setValue(this.isCustomRetention() ? "custom" : String(this.plugin.settings.retentionDays));
        dropdown.onChange(async (value) => {
          this.customRetentionSelected = value === "custom";
          if (value !== "custom") {
            this.plugin.settings.retentionDays = Number(value);
            await this.plugin.saveSettings();
          }
          this.renderCustomRetentionDays(customEl);
        });
      });
      retentionWrap.append(customEl);
      this.renderCustomRetentionDays(customEl);
    }
  }

  private renderCustomRetentionDays(containerEl: HTMLElement): void {
    containerEl.empty();
    if (!this.isCustomRetention()) {
      return;
    }
    new Setting(containerEl).setName(t("settingsRetentionCustomDays")).addText((text) => {
      text.setValue(String(this.plugin.settings.retentionDays));
      text.onChange(async (value) => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return;
        }
        this.plugin.settings.retentionDays = parsed;
        await this.plugin.saveSettings();
      });
    });
  }

  private permissionSetting(containerEl: HTMLElement, name: string, key: keyof PidianPlugin["settings"]["permissions"]): void {
    new Setting(containerEl).setName(name).addDropdown((dropdown) => {
      for (const option of permissionOptions()) {
        dropdown.addOption(option.value, option.label);
      }
      dropdown.setValue(this.plugin.settings.permissions[key]);
      dropdown.onChange(async (value) => {
        this.plugin.settings.permissions[key] = value as Permission;
        await this.plugin.saveSettings();
      });
    });
  }

  private renderCustomProvider(containerEl: HTMLElement, provider: CustomOpenAIProvider): void {
    const wrap = containerEl.createDiv({ cls: "pidian-custom-provider" });
    wrap.dataset.providerId = provider.id;
    const nameSetting = new Setting(wrap).setName(t("settingsName")).setClass("pidian-custom-provider-name");
    nameSetting.addText((text) => {
      text.setValue(provider.name);
      text.inputEl.addClass("pidian-custom-provider-name-input");
      text.onChange(async (value) => {
        provider.name = value;
        this.refreshProviderNameErrors(containerEl);
        await this.plugin.saveSettings();
      });
    });
    const nameError = nameSetting.controlEl.createDiv({ cls: "pidian-settings-field-error pidian-custom-provider-name-error" });
    this.setProviderNameError(nameSetting.controlEl.querySelector("input"), nameError, provider);
    new Setting(wrap).setName(t("settingsBaseUrl")).addText((text) => {
      text.setValue(provider.baseUrl);
      text.onChange(async (value) => {
        provider.baseUrl = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(wrap).setName(t("settingsApiKey")).addText((text) => {
      text.inputEl.type = "password";
      text.setValue(provider.apiKey);
      text.onChange(async (value) => {
        provider.apiKey = value;
        this.plugin.settings.apiKeys[provider.id] = value;
        await this.plugin.saveSettings();
      });
    });
    if (provider.models.length === 0) {
      provider.models.push(createEmptyCustomProviderModel());
    }
    provider.models.forEach((model, index) => {
      this.renderCustomModel(wrap, provider, model, index);
    });
    new Setting(wrap).setClass("pidian-custom-provider-add-model").addButton((button) => {
      button.setButtonText(t("settingsAddModel")).onClick(async () => {
        provider.models.push(createEmptyCustomProviderModel());
        await this.plugin.saveSettings();
        this.refreshSettings();
      });
    });
    new Setting(wrap).setClass("pidian-custom-provider-remove").addButton((button) => {
      button.setButtonText(t("settingsRemove")).setWarning().onClick(async () => {
        this.plugin.settings.customProviders = this.plugin.settings.customProviders.filter(
          (item) => item.id !== provider.id,
        );
        delete this.plugin.settings.apiKeys[provider.id];
        await this.plugin.saveSettings();
        this.refreshSettings();
        new Notice(t("settingsRemovedProvider"));
      });
    });
  }

  private renderCustomModel(
    containerEl: HTMLElement,
    provider: CustomOpenAIProvider,
    model: CustomProviderModel,
    index: number,
  ): void {
    if (!model.name.trim() && model.modelId.trim()) {
      model.name = model.modelId;
    }
    const setting = new Setting(containerEl).setClass("pidian-custom-model");
    const fields = setting.controlEl;
    fields.empty();

    const nameRow = this.addCustomModelTextRow(fields, t("settingsModelSettingName"), model.name, async (value) => {
      model.name = value;
      this.refreshModelNameErrors(containerEl, provider);
      await this.plugin.saveSettings();
    });
    nameRow.input.addClass("pidian-custom-model-name-input");
    nameRow.input.dataset.modelIndex = String(index);
    const nameError = nameRow.row.createDiv({ cls: "pidian-settings-field-error pidian-custom-model-name-error" });
    nameError.dataset.modelIndex = String(index);
    this.setModelNameError(nameRow.input, nameError, provider, index);

    this.addCustomModelTextRow(fields, t("settingsModelId"), model.modelId, async (value) => {
      const previousId = model.modelId;
      model.modelId = value;
      if (!model.id.trim()) {
        model.id = value;
      }
      if (fillModelSettingNameFromId(model, previousId, value)) {
        nameRow.input.value = model.name;
        this.refreshModelNameErrors(containerEl, provider);
      }
      await this.plugin.saveSettings();
    });

    const visionRow = fields.createDiv({ cls: "pidian-custom-model-row pidian-custom-model-row-toggle" });
    const visionLabel = visionRow.createDiv({ cls: "pidian-custom-model-label" });
    visionLabel.createSpan({ text: t("settingsModelSupportsImages") });
    const visionHelp = visionLabel.createEl("button", {
      cls: "clickable-icon pidian-custom-model-json-help",
      attr: {
        type: "button",
        "aria-label": t("settingsModelSupportsImagesHelpAria"),
      },
    });
    appendCircleQuestionIcon(visionHelp);
    visionHelp.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      displayTooltip(visionHelp, t("settingsModelSupportsImagesHelp"));
    });
    const visionControl = visionRow.createDiv({ cls: "pidian-custom-model-control" });
    const vision = visionControl.createEl("input", {
      type: "checkbox",
      attr: { "aria-label": t("settingsModelSupportsImages") },
    });
    vision.checked = Boolean(model.supportsImages);
    vision.addEventListener("change", () => {
      model.supportsImages = vision.checked;
      void this.plugin.saveSettings();
    });

    const jsonKey = customModelJsonKey(provider, model, index);
    const expanded = this.expandedCustomModelJson.has(jsonKey);
    const jsonHeader = fields.createDiv({ cls: "pidian-custom-model-json-header" });
    const toggle = jsonHeader.createEl("button", {
      cls: "pidian-custom-model-json-toggle",
      attr: {
        type: "button",
        "aria-expanded": expanded ? "true" : "false",
      },
    });
    toggle.createSpan({ cls: "pidian-caret", attr: { "aria-hidden": "true" } });
    toggle.createSpan({ text: t("settingsExtraJsonParams") });

    const help = fields.createDiv({ cls: "pidian-custom-model-json-help-panel" });
    help.id = `pidian-extra-json-help-${jsonKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    help.createEl("p", { text: t("settingsExtraJsonHelp") });
    help.createEl("pre", { cls: "pidian-custom-model-json-help-example" }).createEl("code", {
      text: EXTRA_JSON_HELP_EXAMPLE,
    });

    const helpButton = jsonHeader.createEl("button", {
      cls: "clickable-icon pidian-custom-model-json-help",
      attr: {
        type: "button",
        "aria-label": t("settingsExtraJsonHelpAria"),
        "aria-expanded": "false",
        "aria-controls": help.id,
      },
    });
    appendCircleQuestionIcon(helpButton);
    helpButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !help.hasClass("is-open");
      help.toggleClass("is-open", nextOpen);
      helpButton.setAttr("aria-expanded", nextOpen ? "true" : "false");
    });

    const jsonWrap = fields.createDiv({ cls: "pidian-custom-model-json" });
    jsonWrap.toggleClass("is-open", expanded);
    const textarea = jsonWrap.createEl("textarea", {
      attr: {
        spellcheck: "false",
        placeholder: "{}",
        "aria-label": t("settingsExtraJsonParams"),
      },
    });
    textarea.value = model.extraRequestBody;
    const jsonError = jsonWrap.createDiv({ cls: "pidian-settings-field-error" });
    const refreshJsonValidity = (): void => {
      const invalid = extraRequestBodyInvalid(model.extraRequestBody);
      textarea.toggleClass("is-invalid", invalid);
      jsonError.setText(invalid ? t("settingsExtraJsonInvalid") : "");
    };
    refreshJsonValidity();
    textarea.addEventListener("input", () => {
      model.extraRequestBody = textarea.value;
      refreshJsonValidity();
      void this.plugin.saveSettings();
    });

    toggle.addEventListener("click", () => {
      if (this.expandedCustomModelJson.has(jsonKey)) {
        this.expandedCustomModelJson.delete(jsonKey);
      } else {
        this.expandedCustomModelJson.add(jsonKey);
      }
      const nextExpanded = this.expandedCustomModelJson.has(jsonKey);
      jsonWrap.toggleClass("is-open", nextExpanded);
      toggle.setAttr("aria-expanded", nextExpanded ? "true" : "false");
    });

    if (provider.models.length > 1) {
      const removeRow = fields.createDiv({ cls: "pidian-custom-model-remove" });
      const remove = removeRow.createEl("button", {
        cls: "mod-warning",
        text: t("settingsRemoveModel"),
        attr: { type: "button" },
      });
      remove.addEventListener("click", () => {
        this.expandedCustomModelJson.delete(jsonKey);
        provider.models.splice(index, 1);
        void this.plugin.saveSettings().then(() => {
          this.refreshSettings();
        });
      });
    }
  }

  private addCustomModelTextRow(
    parent: HTMLElement,
    label: string,
    value: string,
    onChange: (value: string) => void | Promise<void>,
  ): { row: HTMLElement; control: HTMLElement; input: HTMLInputElement } {
    const row = parent.createDiv({ cls: "pidian-custom-model-row" });
    row.createDiv({ cls: "pidian-custom-model-label", text: label });
    const control = row.createDiv({ cls: "pidian-custom-model-control" });
    const input = control.createEl("input", { type: "text" });
    input.value = value;
    input.addEventListener("input", () => {
      void onChange(input.value);
    });
    return { row, control, input };
  }

  private refreshProviderNameErrors(containerEl: HTMLElement): void {
    for (const wrap of Array.from(containerEl.querySelectorAll(".pidian-custom-provider"))) {
      const id = wrap.getAttribute("data-provider-id");
      const provider = this.plugin.settings.customProviders.find((item) => item.id === id);
      if (!provider) {
        continue;
      }
      this.setProviderNameError(
        wrap.querySelector(".pidian-custom-provider-name-input"),
        wrap.querySelector(".pidian-custom-provider-name-error"),
        provider,
      );
    }
  }

  private setProviderNameError(
    input: Element | null,
    error: Element | null,
    provider: CustomOpenAIProvider,
  ): void {
    const duplicate = isDuplicateCustomProviderName(
      provider.name,
      provider.id,
      this.plugin.settings.customProviders,
      reservedProviderNames(),
    );
    setFieldError(input, error, duplicate ? t("settingsDuplicateProviderName") : "");
  }

  private refreshModelNameErrors(containerEl: HTMLElement, provider: CustomOpenAIProvider): void {
    for (const input of Array.from(containerEl.querySelectorAll(".pidian-custom-model-name-input"))) {
      if (!input.instanceOf(HTMLInputElement)) {
        continue;
      }
      const index = Number(input.dataset.modelIndex);
      if (!Number.isInteger(index)) {
        continue;
      }
      const error =
        containerEl.querySelector(`.pidian-custom-model-name-error[data-model-index="${index}"]`) ??
        input.closest(".pidian-custom-model-row")?.querySelector(".pidian-custom-model-name-error") ??
        null;
      this.setModelNameError(input, error, provider, index);
    }
  }

  private setModelNameError(
    input: Element,
    error: Element | null,
    provider: CustomOpenAIProvider,
    index: number,
  ): void {
    const duplicate = isDuplicateModelSettingName(provider.models, index);
    setFieldError(input, error, duplicate ? t("settingsDuplicateModelSettingName") : "");
  }
}

function customModelJsonKey(provider: CustomOpenAIProvider, model: CustomProviderModel, index: number): string {
  return `${provider.id}:${model.id || `index-${index}`}`;
}

function extraRequestBodyInvalid(raw: string): boolean {
  try {
    parseExtraRequestBody(raw);
    return false;
  } catch {
    return true;
  }
}

function reservedProviderNames(): string[] {
  return listKnownCredentialProviders().flatMap((provider) => [provider.name, provider.id]);
}

function setFieldError(input: Element | null, error: Element | null, message: string): void {
  input?.classList.toggle("is-invalid", Boolean(message));
  if (error) {
    error.textContent = message;
  }
}

const EXTRA_JSON_HELP_EXAMPLE = `{
  "reasoning": {
    "effort": "medium"
  }
}`;

function addModelSelect(
  parent: HTMLElement,
  models: CatalogModel[],
  value: string,
  onChange: (id: string) => void | Promise<void>,
): void {
  const selected = models.find((item) => item.id === value);
  const wrap = parent.createDiv({ cls: "pidian-settings-model-select" });
  const trigger = wrap.createEl("button", {
    cls: "pidian-settings-model-trigger",
    attr: {
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
    },
  });
  trigger.createSpan({
    cls: "pidian-settings-model-trigger-label",
    text: selected?.name ?? value,
  });
  if (selected?.supportsImages) {
    appendVisionBadge(trigger);
  }
  trigger.createSpan({ cls: "pidian-caret", attr: { "aria-hidden": "true" } });

  const menu = wrap.createDiv({ cls: "pidian-settings-model-menu", attr: { role: "listbox" } });
  const containsTarget = (target: EventTarget | null): boolean => {
    return target instanceof Node && wrap.contains(target);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!wrap.isConnected || !containsTarget(event.target)) {
      setOpen(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!wrap.isConnected || event.key === "Escape") {
      setOpen(false);
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    window.setTimeout(() => {
      if (!wrap.isConnected || containsTarget(event.relatedTarget) || containsTarget(document.activeElement)) {
        return;
      }
      setOpen(false);
    }, 0);
  };
  let open = false;
  const setOpen = (next: boolean) => {
    if (open === next) {
      return;
    }
    open = next;
    wrap.toggleClass("is-open", next);
    trigger.setAttr("aria-expanded", next ? "true" : "false");
    if (next) {
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
    } else {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    }
  };

  wrap.addEventListener("focusout", onFocusOut);

  for (const model of models) {
    const item = menu.createEl("button", {
      cls: `pidian-settings-model-menu-item${model.id === value ? " is-selected" : ""}`,
      attr: {
        type: "button",
        role: "option",
        title: model.name,
        "aria-selected": model.id === value ? "true" : "false",
      },
    });
    item.createSpan({ cls: "pidian-settings-model-menu-item-label", text: model.name });
    if (model.supportsImages) {
      appendVisionBadge(item);
    }
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      if (model.id !== value) {
        void onChange(model.id);
      }
    });
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  });
}

function appendVisionBadge(parent: HTMLElement): void {
  const label = t("uiVisionSupported");
  const badge = parent.createSpan({
    cls: "pidian-vision-badge",
    attr: {
      role: "img",
      "aria-label": label,
    },
  });
  appendEyeIcon(badge);
  setTooltip(badge, label, { placement: "top" });
}

function appendEyeIcon(parent: HTMLElement): void {
  const svg = parent.createSvg("svg", {
    cls: "pidian-icon",
    attr: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
  });
  svg.createSvg("path", {
    attr: {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    },
  });
  svg.createSvg("circle", { attr: { cx: "12", cy: "12", r: "3" } });
}

function appendCircleQuestionIcon(parent: HTMLElement): void {
  const svg = parent.createSvg("svg", {
    cls: "pidian-icon",
    attr: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
  });
  svg.createSvg("circle", { attr: { cx: "12", cy: "12", r: "10" } });
  svg.createSvg("path", { attr: { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" } });
  svg.createSvg("path", { attr: { d: "M12 17h.01" } });
}
