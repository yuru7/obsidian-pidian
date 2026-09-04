import type { App } from "obsidian";
import type { ChatInputEditor, ChatInputEditorOptions } from "./chat-input-editor";
import {
  createMarkdownEditorOwner,
  getMarkdownEditorConstructor,
  type MarkdownEditorInstance,
} from "./obsidian-markdown-editor-internal";

const LIVE_CLASS = "has-live-editor";

export function createObsidianLiveEditor(
  app: App,
  containerEl: HTMLElement,
  options: ChatInputEditorOptions = {},
): ChatInputEditor {
  const Ctor = getMarkdownEditorConstructor(app);
  if (!Ctor) {
    throw new Error("Obsidian Markdown editor constructor is unavailable");
  }
  // Do not assign `app.workspace.activeEditor`. This owner has `file = null`
  // and is not a vault note; stealing activeEditor would break context snapshots.
  const owner = createMarkdownEditorOwner(app);
  const instance = new Ctor(app, containerEl, owner);
  try {
    owner.editMode = instance;
    mountEditorDom(instance, containerEl);
    instance.load?.();
    instance.set?.("", true);
    const editor = instance.editor;
    if (!editor || typeof editor.getValue !== "function") {
      throw new Error("Obsidian Markdown editor is missing getValue");
    }
    editor.getValue();
    return wrapLiveEditor(instance, containerEl, options);
  } catch (error) {
    disposeInstance(instance);
    throw error;
  }
}

function mountEditorDom(instance: MarkdownEditorInstance, containerEl: HTMLElement): void {
  const mounted = instance.containerEl ?? instance.editorEl;
  if (mounted && mounted !== containerEl && !containerEl.contains(mounted)) {
    containerEl.append(mounted);
  }
}

function wrapLiveEditor(
  instance: MarkdownEditorInstance,
  containerEl: HTMLElement,
  options: ChatInputEditorOptions,
): ChatInputEditor {
  let disabled = Boolean(options.disabled);
  containerEl.addClass(LIVE_CLASS);
  applyDisabled(containerEl, disabled);

  const onInput = (): void => {
    options.onChange?.(readValue(instance));
  };
  containerEl.addEventListener("input", onInput);

  const editor: ChatInputEditor = {
    getValue() {
      return readValue(instance);
    },
    setValue(value: string) {
      writeValue(instance, value);
      options.onChange?.(value);
    },
    focus() {
      if (disabled) {
        return;
      }
      instance.editor?.focus();
    },
    insertText(text: string) {
      if (disabled) {
        return;
      }
      const cm = instance.editor;
      if (cm && typeof cm.replaceSelection === "function") {
        cm.replaceSelection(text);
      } else {
        writeValue(instance, `${readValue(instance)}${text}`);
      }
      options.onChange?.(readValue(instance));
    },
    newline() {
      if (disabled) {
        return;
      }
      newlineAsEditorEnter(instance, containerEl);
      options.onChange?.(readValue(instance));
    },
    clear() {
      writeValue(instance, "");
      options.onChange?.("");
    },
    destroy() {
      containerEl.removeEventListener("input", onInput);
      containerEl.removeClass(LIVE_CLASS);
      disposeInstance(instance);
      try {
        containerEl.empty();
      } catch {
        containerEl.replaceChildren();
      }
    },
    setDisabled(next: boolean) {
      disabled = next;
      applyDisabled(containerEl, disabled);
    },
  };
  return editor;
}

function readValue(instance: MarkdownEditorInstance): string {
  return instance.editor?.getValue() ?? "";
}

function writeValue(instance: MarkdownEditorInstance, value: string): void {
  if (typeof instance.set === "function") {
    instance.set(value, true);
  } else {
    instance.editor?.setValue(value);
  }
  moveCursorToEnd(instance);
}

function moveCursorToEnd(instance: MarkdownEditorInstance): void {
  const editor = instance.editor;
  if (!editor?.setCursor || !editor.lastLine || !editor.getLine) {
    return;
  }
  const line = editor.lastLine();
  editor.setCursor({ line, ch: editor.getLine(line).length });
}

/**
 * Shift+Enter in the composer is remapped to a plain Enter so lists / quotes
 * continue the same way as in a note. Public `Editor.exec("newlineAndIndent")`
 * skips Obsidian's Markdown Enter keymap, so we replay Enter onto CodeMirror's
 * contenteditable (`.cm-content`). That class is CodeMirror DOM; if it changes
 * we fall back to `exec` then `replaceSelection`.
 */
function newlineAsEditorEnter(instance: MarkdownEditorInstance, containerEl: HTMLElement): void {
  const target = instance.editor?.cm?.contentDOM ?? queryCmContent(containerEl);
  if (target && dispatchPlainEnter(target)) {
    return;
  }
  const editor = instance.editor;
  if (editor && typeof editor.exec === "function") {
    editor.exec("newlineAndIndent");
    return;
  }
  editor?.replaceSelection("\n");
}

function queryCmContent(containerEl: HTMLElement): HTMLElement | null {
  if (typeof containerEl.querySelector !== "function") {
    return null;
  }
  return containerEl.querySelector(".cm-content");
}

function dispatchPlainEnter(target: { dispatchEvent: (event: Event) => boolean }): boolean {
  try {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function applyDisabled(containerEl: HTMLElement, disabled: boolean): void {
  containerEl.toggleClass("is-disabled", disabled);
  containerEl.inert = disabled;
}

function disposeInstance(instance: MarkdownEditorInstance): void {
  try {
    instance.unload?.();
  } catch {
    try {
      instance.destroy?.();
    } catch {
      // Best-effort teardown when the internal editor is already half-dead.
    }
  }
}
