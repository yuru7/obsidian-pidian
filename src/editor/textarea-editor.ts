import { fitTextarea } from "../ui/fitTextarea";
import type { ChatInputEditor, ChatInputEditorOptions } from "./chat-input-editor";

const MIN_ROWS = 2;
const MAX_ROWS = 4;

export function createTextareaEditor(
  containerEl: HTMLElement,
  options: ChatInputEditorOptions = {},
): ChatInputEditor {
  const textarea = containerEl.createEl("textarea", {
    cls: "pidian-input",
    attr: {
      rows: String(MIN_ROWS),
    },
  });
  containerEl.addClass("has-textarea");
  textarea.disabled = Boolean(options.disabled);
  tryFit(textarea);

  const emit = (): void => {
    options.onChange?.(textarea.value);
  };
  const onInput = (): void => {
    tryFit(textarea);
    emit();
  };
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("focus", () => tryFit(textarea));

  return {
    getValue() {
      return textarea.value;
    },
    setValue(value: string) {
      textarea.value = value;
      textarea.setSelectionRange(value.length, value.length);
      tryFit(textarea);
      emit();
    },
    focus() {
      if (textarea.disabled) {
        return;
      }
      textarea.focus();
    },
    insertText(text: string) {
      if (textarea.disabled) {
        return;
      }
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      const next = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
      textarea.value = next;
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
      tryFit(textarea);
      emit();
    },
    newline() {
      this.insertText("\n");
    },
    clear() {
      textarea.value = "";
      tryFit(textarea);
      emit();
    },
    destroy() {
      textarea.removeEventListener("input", onInput);
      containerEl.removeClass("has-textarea");
      try {
        containerEl.empty();
      } catch {
        containerEl.replaceChildren();
      }
    },
    setDisabled(disabled: boolean) {
      textarea.disabled = disabled;
    },
  };
}

function tryFit(el: HTMLTextAreaElement): void {
  try {
    fitTextarea(el, MIN_ROWS, MAX_ROWS);
  } catch {
    // Detached nodes in unit tests have no computed style.
  }
}
