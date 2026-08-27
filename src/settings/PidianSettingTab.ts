import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type PidianPlugin from "../main";
import type { CatalogModel, CatalogProvider } from "../domain/agent/ModelCatalog";
import type { Permission } from "../domain/permissions/Permission";
import { listKnownCredentialProviders } from "../infrastructure/pi/PiCredentials";
import type { CustomOpenAIProvider } from "./Settings";

const PERMISSION_OPTIONS: Array<{ value: Permission; label: string }> = [
  { value: "allow", label: "Always allow" },
  { value: "ask", label: "Ask every time" },
  { value: "deny", label: "Deny" },
];

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
    this.renderAgent(agentEl, fallbackProviders, fallbackModels);

    this.renderCustomProviders(containerEl);
    this.renderCredentials(containerEl, fallbackProviders);
    this.renderContext(containerEl);
    this.renderPermissions(containerEl);
    this.renderEditing(containerEl);
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
        text: "Agent catalog is not initialized. Provider and model can still be typed from the lists above after reload.",
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
      this.renderAgent(agentEl, providers.length > 0 ? providers : this.fallbackProviders(), models);
    } catch (error) {
      if (!agentEl.isConnected) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      agentEl.createEl("p", {
        cls: "setting-item-description",
        text: `Could not load the model catalog: ${message}`,
      });
    }
  }

  private renderAgent(containerEl: HTMLElement, providers: CatalogProvider[], models: CatalogModel[]): void {
    containerEl.createEl("h3", { text: "Agent" });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Default provider for new chats.")
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
      .setName("Model")
      .setDesc("Default model for new chats.")
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
    containerEl.createEl("h3", { text: "Custom OpenAI Compatible" });
    for (const provider of this.plugin.settings.customProviders) {
      this.renderCustomProvider(containerEl, provider);
    }
    new Setting(containerEl).addButton((button) => {
      button.setButtonText("Add provider").onClick(async () => {
        this.plugin.settings.customProviders.push({
          id: `custom-${crypto.randomUUID()}`,
          name: "Custom OpenAI Compatible",
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
    containerEl.createEl("h3", { text: "Credentials" });
    containerEl.createEl("p", {
      text: "API keys are stored in this plugin's Obsidian data. Leave a field empty to use an environment variable or Pi's existing credentials.",
    });
    for (const provider of providers.filter((item) => !item.isCustom)) {
      const envNames = provider.envVarNames;
      const usingEnv =
        !this.plugin.settings.apiKeys[provider.id]?.trim() && envNames.some((name) => Boolean(process.env[name]));
      new Setting(containerEl)
        .setName(provider.name)
        .setDesc(usingEnv ? "Using environment variable" : envNames.join(", ") || "API key")
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder("API key").setValue(this.plugin.settings.apiKeys[provider.id] ?? "");
          text.onChange(async (value) => {
            this.plugin.settings.apiKeys[provider.id] = value;
            await this.plugin.saveSettings();
          });
        });
    }
  }

  private renderContext(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Context" });
    new Setting(containerEl)
      .setName("Include selected text context")
      .setDesc("When text is selected in the active note, send it as focus context in addition to the full note.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.includeSelectionContext);
        toggle.onChange(async (value) => {
          this.plugin.settings.includeSelectionContext = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderPermissions(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Permissions" });
    this.permissionSetting(containerEl, "Read", "read");
    this.permissionSetting(containerEl, "Search", "search");
    this.permissionSetting(containerEl, "Create", "create");
    this.permissionSetting(containerEl, "Edit", "edit");
  }

  private renderEditing(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Editing" });
    new Setting(containerEl)
      .setName("Maximum editable notes")
      .setDesc("How many notes Pidian may keep open for Undo. Extra edit requests are refused.")
      .addSlider((slider) => {
        slider.setLimits(1, 10, 1);
        slider.setDynamicTooltip();
        slider.setValue(this.plugin.settings.maxEditableNotes);
        slider.onChange(async (value) => {
          this.plugin.settings.maxEditableNotes = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderSession(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Session" });
    new Setting(containerEl)
      .setName("Automatically delete old sessions")
      .setDesc("Off by default. When enabled, sessions older than the retention period are deleted on startup.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoDeleteSessions);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoDeleteSessions = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.autoDeleteSessions) {
      new Setting(containerEl).setName("Retention days").addDropdown((dropdown) => {
        dropdown.addOption("7", "7");
        dropdown.addOption("30", "30");
        dropdown.addOption("90", "90");
        dropdown.addOption("custom", "Custom");
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
        new Setting(containerEl).setName("Custom retention days").addText((text) => {
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
      for (const option of PERMISSION_OPTIONS) {
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
    new Setting(wrap).setName("Name").addText((text) => {
      text.setValue(provider.name);
      text.onChange(async (value) => {
        provider.name = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(wrap).setName("Base URL").addText((text) => {
      text.setValue(provider.baseUrl);
      text.onChange(async (value) => {
        provider.baseUrl = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(wrap).setName("Model ID").addText((text) => {
      text.setValue(provider.modelId);
      text.onChange(async (value) => {
        provider.modelId = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(wrap).setName("API key").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(provider.apiKey);
      text.onChange(async (value) => {
        provider.apiKey = value;
        this.plugin.settings.apiKeys[provider.id] = value;
        await this.plugin.saveSettings();
      });
    });
    new Setting(wrap).addButton((button) => {
      button.setButtonText("Remove").setWarning().onClick(async () => {
        this.plugin.settings.customProviders = this.plugin.settings.customProviders.filter(
          (item) => item.id !== provider.id,
        );
        delete this.plugin.settings.apiKeys[provider.id];
        await this.plugin.saveSettings();
        this.display();
        new Notice("Removed custom provider");
      });
    });
  }
}
