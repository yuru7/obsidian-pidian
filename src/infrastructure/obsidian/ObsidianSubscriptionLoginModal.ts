import { Modal, Notice, type App } from "obsidian";
import { t } from "../../i18n";
import type {
  SubscriptionLoginEvent,
  SubscriptionLoginInteraction,
  SubscriptionLoginPrompt,
} from "../../domain/agent/SubscriptionAuth";

export class ObsidianSubscriptionLoginModal extends Modal implements SubscriptionLoginInteraction {
  readonly signal: AbortSignal;
  private readonly abort = new AbortController();
  private statusEl?: HTMLElement;
  private detailEl?: HTMLElement;
  private promptEl?: HTMLElement;
  private pending?: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  };
  private completed = false;
  private showingAuthUrl = false;

  constructor(app: App) {
    super(app);
    this.signal = this.abort.signal;
  }

  onOpen(): void {
    this.modalEl.addClass("pidian-login-modal");
    this.titleEl.setText(t("settingsSubscriptionLoginTitle"));
    this.contentEl.empty();
    this.statusEl = this.contentEl.createEl("p", {
      cls: "pidian-login-status",
      text: t("settingsSubscriptionWaiting"),
    });
    this.detailEl = this.contentEl.createDiv({ cls: "pidian-login-detail" });
    this.promptEl = this.contentEl.createDiv({ cls: "pidian-login-prompt" });
    const footer = this.contentEl.createDiv({ cls: "pidian-login-footer" });
    footer.createEl("button", { text: t("settingsSubscriptionCancel") }).addEventListener("click", () => {
      this.cancel();
    });
    this.scope.register([], "Escape", () => {
      this.cancel();
      return false;
    });
  }

  onClose(): void {
    if (!this.completed) {
      this.abort.abort();
      this.rejectPending(new DOMException("Login cancelled", "AbortError"));
    }
    this.contentEl.empty();
  }

  finishSuccess(): void {
    this.completed = true;
    this.close();
  }

  prompt(prompt: SubscriptionLoginPrompt): Promise<string> {
    return new Promise((resolve, reject) => {
      this.rejectPending(new DOMException("Login cancelled", "AbortError"));
      const onAbort = () => {
        this.rejectPending(new DOMException("Login cancelled", "AbortError"));
      };
      prompt.signal?.addEventListener("abort", onAbort, { once: true });
      this.signal.addEventListener("abort", onAbort, { once: true });
      this.pending = {
        resolve: (value) => {
          prompt.signal?.removeEventListener("abort", onAbort);
          this.signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        reject: (error) => {
          prompt.signal?.removeEventListener("abort", onAbort);
          this.signal.removeEventListener("abort", onAbort);
          reject(error);
        },
        cleanup: () => {
          prompt.signal?.removeEventListener("abort", onAbort);
          this.signal.removeEventListener("abort", onAbort);
        },
      };
      this.renderPrompt(prompt);
    });
  }

  notify(event: SubscriptionLoginEvent): void {
    if (event.type === "info" || event.type === "progress") {
      if (!this.showingAuthUrl) {
        this.setStatus(event.message);
      }
      return;
    }
    if (event.type === "auth_url") {
      this.showingAuthUrl = true;
      this.setStatus(t("settingsSubscriptionOpenUrl"));
      this.renderLink(event.url);
      return;
    }
    this.showingAuthUrl = false;
    this.setStatus(t("settingsSubscriptionEnterCode"));
    this.renderDeviceCode(event.verificationUri, event.userCode);
  }

  private renderPrompt(prompt: SubscriptionLoginPrompt): void {
    const host = this.promptEl;
    if (!host) {
      return;
    }
    host.empty();
    if (prompt.type === "select") {
      this.setStatus(prompt.message);
      const options = host.createDiv({ cls: "pidian-login-actions" });
      for (const option of prompt.options) {
        const button = options.createEl("button", { text: option.label });
        button.addEventListener("click", () => this.resolvePending(option.id));
      }
      return;
    }
    if (!this.showingAuthUrl) {
      this.setStatus(prompt.message);
    }
    const paste = host.createDiv({ cls: "pidian-login-paste" });
    if (prompt.type === "manual_code") {
      paste.createEl("p", {
        cls: "pidian-login-paste-label",
        text: t("settingsSubscriptionPasteCode"),
      });
    } else if (this.showingAuthUrl) {
      paste.createEl("p", { cls: "pidian-login-paste-label", text: prompt.message });
    }
    const row = paste.createDiv({ cls: "pidian-login-paste-row" });
    const input = row.createEl("input");
    input.type = prompt.type === "secret" ? "password" : "text";
    input.placeholder = prompt.placeholder ?? "";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.resolvePending(input.value);
      }
    });
    const continueButton = row.createEl("button", { text: t("settingsSubscriptionContinue") });
    continueButton.addClass("mod-cta");
    continueButton.addEventListener("click", () => this.resolvePending(input.value));
  }

  private renderLink(url: string): void {
    const host = this.detailEl;
    if (!host) {
      return;
    }
    host.empty();
    this.appendUrl(host, url);
  }

  private renderDeviceCode(url: string, userCode: string): void {
    const host = this.detailEl;
    if (!host) {
      return;
    }
    host.empty();
    this.appendUrl(host, url);
    const codeRow = host.createDiv({ cls: "pidian-login-code-row" });
    codeRow.createSpan({ cls: "pidian-login-code-label", text: t("settingsSubscriptionUserCode") });
    codeRow.createEl("code", { cls: "pidian-login-code", text: userCode });
    const actions = host.createDiv({ cls: "pidian-login-actions" });
    const copy = actions.createEl("button", { text: t("uiCopy") });
    copy.addEventListener("click", () => {
      void this.copyText(userCode);
    });
  }

  private appendUrl(host: HTMLElement, url: string): void {
    const link = host.createEl("a", { cls: "pidian-login-url", href: url, text: url });
    link.setAttr("target", "_blank");
    link.setAttr("rel", "noopener");
    const actions = host.createDiv({ cls: "pidian-login-actions" });
    const copy = actions.createEl("button", { text: t("settingsSubscriptionCopyUrl") });
    copy.addEventListener("click", () => {
      void this.copyText(url);
    });
  }

  private async copyText(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    new Notice(t("uiCopied"));
  }

  private setStatus(message: string): void {
    if (this.statusEl) {
      this.statusEl.setText(message);
    }
  }

  private resolvePending(value: string): void {
    const pending = this.pending;
    this.pending = undefined;
    this.promptEl?.empty();
    pending?.cleanup();
    pending?.resolve(value);
  }

  private rejectPending(error: Error): void {
    const pending = this.pending;
    this.pending = undefined;
    this.promptEl?.empty();
    pending?.cleanup();
    pending?.reject(error);
  }

  private cancel(): void {
    this.abort.abort();
    this.close();
  }
}

export function isSubscriptionLoginAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || /abort|cancel/i.test(error.message);
}
