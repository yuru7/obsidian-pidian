import type { App } from "obsidian";
import { createObsidianLiveEditor } from "./obsidian-live-editor";
import { createTextareaEditor } from "./textarea-editor";

export interface ChatInputEditor {
  getValue(): string;
  setValue(value: string): void;
  focus(): void;
  insertText(text: string): void;
  newline(): void;
  clear(): void;
  destroy(): void;
  setDisabled(disabled: boolean): void;
}

export type ChatInputEditorOptions = {
  disabled?: boolean;
  onChange?: (value: string) => void;
};

const LIVE_EDITOR_FALLBACK_WARNING =
  "[Pidian] Failed to initialize Obsidian Markdown editor; falling back to textarea.";

/**
 * Mount a chat composer editor into `containerEl`.
 * Tries Obsidian Live Preview first; any failure falls back to a textarea.
 *
 * The editor owns an inner mount node so React can keep updating attributes on
 * `containerEl` without wiping Live Preview / textarea DOM.
 */
export function createChatInputEditor(
  app: App,
  containerEl: HTMLElement,
  options: ChatInputEditorOptions = {},
): ChatInputEditor {
  const mount = containerEl.createDiv({ cls: "pidian-composer-mount" });
  const editor = createEditor(app, mount, options);
  return {
    getValue: () => editor.getValue(),
    setValue: (value) => editor.setValue(value),
    focus: () => editor.focus(),
    insertText: (text) => editor.insertText(text),
    newline: () => editor.newline(),
    clear: () => editor.clear(),
    setDisabled: (disabled) => editor.setDisabled(disabled),
    destroy() {
      editor.destroy();
      mount.remove();
    },
  };
}

function createEditor(app: App, mount: HTMLElement, options: ChatInputEditorOptions): ChatInputEditor {
  try {
    return createObsidianLiveEditor(app, mount, options);
  } catch (error) {
    console.warn(LIVE_EDITOR_FALLBACK_WARNING, error);
    try {
      mount.empty();
    } catch {
      mount.replaceChildren();
    }
    return createTextareaEditor(mount, options);
  }
}
