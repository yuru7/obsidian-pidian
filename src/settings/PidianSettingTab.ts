import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import type { CatalogModel, CatalogProvider } from "../domain/agent/ModelCatalog";
import type { Permission } from "../domain/permissions/Permission";
import { listKnownCredentialProviders } from "../infrastructure/pi/PiCredentials";
import type { CustomOpenAIProvider } from "./Settings";

function permissionOptions(): Array<{ value: Permission; label: string }> {
  return [
    { value: "allow", label: t("settingsPermissionAllow") },
    { value: "ask", label: t("settingsPermissionAsk") },
    { value: "deny", label: t("settingsPermissionDeny") },
  ];
}

export class PidianSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: PidianPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Pidian" });

    const agentEl = containerEl.createDiv();
    const fallbackProviders = this.fallbackProviders();
    const fallbackModels = this.fallbackModels(this.plugin.settings.model);
    this.renderAgent(agentEl, this.selectableProviders(fallbackProviders), fallbackModels);

    this.renderPermissions(containerEl);
    this.renderCustomProviders(containerEl);
    this.renderCredentials(containerEl, fallbackProviders);
    this.renderContext(containerEl);
    this.renderSession(containerEl);

    void this.enrichAgentFromCatalog(agentEl);
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
    return providers.filter((provider) => credentials.hasCredential(provider.id));
  }

  private fallbackModels(modelId: string): CatalogModel[] {
    if (!modelId) {
      return [];
    }
    return [{ id: modelId, name: modelId, providerId: this.plugin.settings.provider }];
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
    containerEl.createEl("h3", { text: t("settingsAgent") });

    new Setting(containerEl)
      .setName(t("settingsProvider"))
      .setDesc(t("settingsProviderDesc"))
      .addDropdown((dropdown) => {
        for (const provider of providers) {
          dropdown.addOption(provider.id, provider.name);
        }
        dropdown.setValue(this.plugin.settings.provider);
        dropdown.onChange(async (value) => {
          this.plugin.settings.provider = value;
          const catalog = this.plugin.modelCatalog;
          const nextModels = catalog ? await catalog.listModels(value).catch(() => []) : [];
          this.plugin.settings.model = nextModels[0]?.id ?? "";
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t("settingsModel"))
      .setDesc(t("settingsModelDesc"))
      .addDropdown((dropdown) => {
        const options = models.length > 0 ? models : this.fallbackModels(this.plugin.settings.model);
        for (const model of options) {
          dropdown.addOption(model.id, model.name);
        }
        dropdown.setValue(this.plugin.settings.model);
        dropdown.onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderCustomProviders(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: t("settingsCustomProviders") });
    for (const provider of this.plugin.settings.customProviders) {
      this.renderCustomProvider(containerEl, provider);
    }
    new Setting(containerEl).addButton((button) => {
      button.setButtonText(t("settingsAddProvider")).onClick(async () => {
        this.plugin.settings.customProviders.push({
          id: `custom-${crypto.randomUUID()}`,
          name: t("settingsCustomProviderDefaultName"),
          baseUrl: "http://localhost:11434/v1",
          modelId: "",
          apiKey: "",
        });
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }

  private renderCredentials(containerEl: HTMLElement, providers: CatalogProvider[]): void {
    containerEl.createEl("h3", { text: t("settingsCredentials") });
    containerEl.createEl("p", {
      text: t("settingsCredentialsHelp"),
    });
    for (const provider of providers.filter((item) => !item.isCustom)) {
      const envNames = provider.envVarNames;
      const usingEnv =
        !this.plugin.settings.apiKeys[provider.id]?.trim() && envNames.some((name) => Boolean(process.env[name]));
      new Setting(containerEl)
        .setName(provider.name)
        .setDesc(usingEnv ? t("settingsUsingEnv") : envNames.join(", ") || t("settingsApiKey"))
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

  private renderContext(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: t("settingsContext") });
    new Setting(containerEl)
      .setName(t("settingsIncludeSelection"))
      .setDesc(t("settingsIncludeSelectionDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.includeSelectionContext);
        toggle.onChange(async (value) => {
          this.plugin.settings.includeSelectionContext = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderPermissions(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: t("settingsPermissions") });
    this.permissionSetting(containerEl, t("settingsPermissionRead"), "read");
    this.permissionSetting(containerEl, t("settingsPermissionEdit"), "edit");
    this.permissionSetting(containerEl, t("settingsPermissionCreate"), "create");
    this.permissionSetting(containerEl, t("settingsPermissionDelete"), "delete");
  }

  private renderSession(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: t("settingsSession") });
    new Setting(containerEl)
      .setName(t("settingsAutoDelete"))
      .setDesc(t("settingsAutoDeleteDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoDeleteSessions);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoDeleteSessions = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.autoDeleteSessions) {
      new Setting(containerEl).setName(t("settingsRetentionDays")).addDropdown((dropdown) => {
        dropdown.addOption("7", "7");
        dropdown.addOption("30", "30");
        dropdown.addOption("90", "90");
        dropdown.addOption("custom", t("settingsRetentionCustom"));
        const preset = ["7", "30", "90"].includes(String(this.plugin.settings.retentionDays))
          ? String(this.plugin.settings.retentionDays)
          : "custom";
        dropdown.setValue(preset);
        dropdown.onChange(async (value) => {
          if (value !== "custom") {
            this.plugin.settings.retentionDays = Number(value);
            await this.plugin.saveSettings();
            this.display();
          }
        });
      });
      if (!["7", "30", "90"].includes(String(this.plugin.settings.retentionDays))) {
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
    }
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
    new Setting(wrap).setName(t("settingsModelId")).addText((text) => {
      text.setValue(provider.modelId);
      text.onChange(async (value) => {
        provider.modelId = value;
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
    new Setting(wrap).addButton((button) => {
      button.setButtonText(t("settingsRemove")).setWarning().onClick(async () => {
        this.plugin.settings.customProviders = this.plugin.settings.customProviders.filter(
          (item) => item.id !== provider.id,
        );
        delete this.plugin.settings.apiKeys[provider.id];
        await this.plugin.saveSettings();
        this.display();
        new Notice(t("settingsRemovedProvider"));
      });
    });
  }
}
