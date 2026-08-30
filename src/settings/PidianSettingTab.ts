import { Notice, PluginSettingTab, Setting, setIcon, type App } from "obsidian";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import type { CatalogModel, CatalogProvider } from "../domain/agent/ModelCatalog";
import { clampThinkingLevel, hasSelectableThinkingLevels } from "../domain/agent/thinkingLevel";
import type { Permission } from "../domain/permissions/Permission";
import { DEFAULT_PLUGIN_DIRECTORY, isValidPluginDirectory, normalizeNotePath } from "../application/notePath";
import { listKnownCredentialProviders } from "../infrastructure/pi/PiCredentials";
import { DEFAULT_SETTINGS, parseSessionFileFormat, type CustomOpenAIProvider } from "./Settings";

const RETENTION_PRESETS = new Set(["7", "30", "90"]);

type SettingsTabId = "general" | "permissions" | "apiAuth" | "session";

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
    { id: "permissions", label: t("settingsTabPermissions") },
    { id: "apiAuth", label: t("settingsTabApiAuth") },
    { id: "session", label: t("settingsTabSession") },
  ];
}

export class PidianSettingTab extends PluginSettingTab {
  private customRetentionSelected = false;
  private selectedTab: SettingsTabId = "general";
  private lastRenderedTab: SettingsTabId | null = null;

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
    this.renderPluginDirectory(containerEl);
    void this.enrichAgentFromCatalog(agentEl);
  }

  private renderApiAuth(containerEl: HTMLElement): void {
    this.renderCredentials(containerEl, this.fallbackProviders());
    this.renderCustomProviders(containerEl);
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
    new Setting(containerEl)
      .setName(t("settingsModel"))
      .setDesc(t("settingsModelDesc"))
      .addDropdown((dropdown) => {
        for (const model of modelOptions) {
          dropdown.addOption(model.id, model.name);
        }
        dropdown.setValue(this.plugin.settings.model);
        dropdown.onChange(async (value) => {
          const selected = modelOptions.find((item) => item.id === value);
          await this.applyAgentSelection(this.plugin.settings.provider, value, selected?.thinkingLevels ?? []);
          this.refreshSettings();
        });
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
    new Setting(containerEl).addButton((button) => {
      button.setButtonText(t("settingsAddProvider")).onClick(async () => {
        this.plugin.settings.customProviders.push({
          id: `custom-${crypto.randomUUID()}`,
          name: t("settingsCustomProviderDefaultName"),
          baseUrl: "http://localhost:11434/v1",
          modelIds: [""],
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
        dropdown.addOption("json.md", ".json.md");
        dropdown.addOption("json", ".json");
        dropdown.setValue(this.plugin.settings.sessionFileFormat);
        dropdown.onChange(async (value) => {
          this.plugin.settings.sessionFileFormat = parseSessionFileFormat(value);
          await this.plugin.saveSettings();
        });
      });
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
    new Setting(wrap).setName(t("settingsName")).addText((text) => {
      text.setValue(provider.name);
      text.onChange(async (value) => {
        provider.name = value;
        await this.plugin.saveSettings();
      });
    });
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
    if (provider.modelIds.length === 0) {
      provider.modelIds.push("");
    }
    provider.modelIds.forEach((modelId, index) => {
      const setting = new Setting(wrap).setName(t("settingsModelId")).addText((text) => {
        text.setValue(modelId);
        text.onChange(async (value) => {
          provider.modelIds[index] = value;
          await this.plugin.saveSettings();
        });
      });
      if (provider.modelIds.length > 1) {
        setting.addExtraButton((button) => {
          button.setIcon("minus").setTooltip(t("settingsRemoveModel")).onClick(async () => {
            provider.modelIds.splice(index, 1);
            await this.plugin.saveSettings();
            this.refreshSettings();
          });
        });
      }
    });
    new Setting(wrap).setClass("pidian-custom-provider-add-model").addButton((button) => {
      button.setButtonText("+").setTooltip(t("settingsAddModel")).onClick(async () => {
        provider.modelIds.push("");
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
}
