import { Modal, Setting, type App } from "obsidian";
import { t } from "../../i18n";
import type { PermissionPrompter, PermissionRequest } from "../../domain/permissions/Permission";

export class ObsidianPermissionPrompter implements PermissionPrompter {
  constructor(private readonly app: App) {}

  confirm(request: PermissionRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmToolModal(this.app, request, resolve);
      modal.open();
    });
  }
}

class ConfirmToolModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly request: PermissionRequest,
    private readonly finish: (allowed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("permissionAllowTitle", { tool: this.request.toolName }));
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.request.summary });
    if (this.request.details) {
      this.contentEl.createEl("pre", {
        cls: "pidian-confirm-details",
        text: this.request.details,
      });
    }

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText(t("permissionDeny")).onClick(() => this.settle(false));
      })
      .addButton((button) => {
        button
          .setButtonText(t("permissionAllow"))
          .setCta()
          .onClick(() => this.settle(true));
      });

    this.scope.register([], "Escape", () => {
      this.settle(false);
      return false;
    });
  }

  private settle(allowed: boolean, closeModal = true): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.finish(allowed);
    if (closeModal) {
      this.close();
    }
  }

  onClose(): void {
    this.settle(false, false);
    this.contentEl.empty();
  }
}
