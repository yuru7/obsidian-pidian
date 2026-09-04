import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { MarkdownEditorConstructor, MarkdownEditorInstance } from "./obsidian-markdown-editor-internal";

const { FakeMarkdownEditor, getMarkdownEditorConstructor, createFakeEl } = vi.hoisted(() => {
  type Listener = EventListenerOrEventListenerObject;
  type FakeEl = {
    tag: string;
    className: string;
    children: FakeEl[];
    parent: FakeEl | null;
    listeners: Map<string, Set<Listener>>;
    value: string;
    disabled: boolean;
    selectionStart: number;
    selectionEnd: number;
    focused: boolean;
    inert: boolean;
    createDiv: (opts?: { cls?: string }) => FakeEl;
    createEl: (tag: string, opts?: { cls?: string; attr?: Record<string, string> }) => FakeEl;
    addClass: (name: string) => void;
    removeClass: (name: string) => void;
    toggleClass: (name: string, force: boolean) => void;
    empty: () => void;
    replaceChildren: () => void;
    append: (...nodes: FakeEl[]) => void;
    contains: (node: FakeEl | null) => boolean;
    remove: () => void;
    addEventListener: (type: string, listener: Listener) => void;
    removeEventListener: (type: string, listener: Listener) => void;
    setSelectionRange: (start: number, end: number) => void;
    focus: () => void;
  };

  function createFakeEl(tag = "div"): FakeEl {
    const el: FakeEl = {
      tag,
      className: "",
      children: [],
      parent: null,
      listeners: new Map(),
      value: "",
      disabled: false,
      selectionStart: 0,
      selectionEnd: 0,
      focused: false,
      inert: false,
      createDiv(opts) {
        return el.createEl("div", opts);
      },
      createEl(childTag, opts) {
        const child = createFakeEl(childTag);
        if (opts?.cls) {
          child.className = opts.cls;
        }
        child.parent = el;
        el.children.push(child);
        return child;
      },
      addClass(name) {
        el.className = `${el.className} ${name}`.trim();
      },
      removeClass(name) {
        el.className = el.className
          .split(/\s+/)
          .filter((part) => part && part !== name)
          .join(" ");
      },
      toggleClass(name, force) {
        if (force) {
          el.addClass(name);
        } else {
          el.removeClass(name);
        }
      },
      empty() {
        el.children = [];
      },
      replaceChildren() {
        el.children = [];
      },
      append(...nodes) {
        for (const node of nodes) {
          node.parent = el;
          el.children.push(node);
        }
      },
      contains(node) {
        if (!node) {
          return false;
        }
        if (node === el) {
          return true;
        }
        return el.children.some((child) => child.contains(node));
      },
      remove() {
        if (!el.parent) {
          return;
        }
        el.parent.children = el.parent.children.filter((child) => child !== el);
        el.parent = null;
      },
      addEventListener(type, listener) {
        const set = el.listeners.get(type) ?? new Set();
        set.add(listener);
        el.listeners.set(type, set);
      },
      removeEventListener(type, listener) {
        el.listeners.get(type)?.delete(listener);
      },
      setSelectionRange(start, end) {
        el.selectionStart = start;
        el.selectionEnd = end;
      },
      focus() {
        el.focused = true;
      },
    };
    return el;
  }

  class FakeMarkdownEditor {
    editor: MarkdownEditorInstance["editor"];
    containerEl: HTMLElement;
    value = "";

    constructor(_app: App, containerEl: HTMLElement) {
      this.containerEl = containerEl;
      this.editor = {
        getValue: () => this.value,
        setValue: (next: string) => {
          this.value = next;
        },
        replaceSelection: (text: string) => {
          this.value += text;
        },
        focus: () => {},
      };
    }

    set(data: string): void {
      this.value = data;
    }

    load(): void {}
    unload(): void {}
  }

  return {
    FakeMarkdownEditor,
    getMarkdownEditorConstructor: vi.fn(),
    createFakeEl,
  };
});

vi.mock("./obsidian-markdown-editor-internal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./obsidian-markdown-editor-internal")>();
  return {
    ...actual,
    getMarkdownEditorConstructor,
  };
});

vi.mock("obsidian", () => ({
  createDiv: () => createFakeEl(),
}));

import { createChatInputEditor } from "./chat-input-editor";

describe("createChatInputEditor", () => {
  beforeEach(() => {
    getMarkdownEditorConstructor.mockReset();
  });

  it("uses the Live Preview editor when the constructor is available", () => {
    getMarkdownEditorConstructor.mockReturnValue(FakeMarkdownEditor as unknown as MarkdownEditorConstructor);
    const host = createFakeEl();
    const editor = createChatInputEditor({} as App, host as unknown as HTMLElement);
    editor.setValue("live");
    expect(editor.getValue()).toBe("live");
    expect(host.children[0]?.className).toContain("has-live-editor");
    editor.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("falls back to a textarea when the Markdown editor cannot be created", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getMarkdownEditorConstructor.mockReturnValue(null);
    const host = createFakeEl();
    const editor = createChatInputEditor({} as App, host as unknown as HTMLElement);
    expect(warn).toHaveBeenCalledWith(
      "[Pidian] Failed to initialize Obsidian Markdown editor; falling back to textarea.",
      expect.any(Error),
    );
    const mount = host.children[0];
    expect(mount?.children[0]?.tag).toBe("textarea");
    editor.setValue("fallback");
    expect(editor.getValue()).toBe("fallback");
    editor.insertText("!");
    expect(editor.getValue()).toBe("fallback!");
    editor.destroy();
    expect(host.children).toHaveLength(0);
    warn.mockRestore();
  });

  it("falls back to a textarea when Live Preview construction throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class BrokenEditor {
      constructor() {
        throw new Error("mount failed");
      }
    }
    getMarkdownEditorConstructor.mockReturnValue(BrokenEditor as unknown as MarkdownEditorConstructor);
    const host = createFakeEl();
    const editor = createChatInputEditor({} as App, host as unknown as HTMLElement);
    expect(editor.getValue()).toBe("");
    editor.setValue("ok");
    expect(editor.getValue()).toBe("ok");
    expect(host.children[0]?.children[0]?.tag).toBe("textarea");
    warn.mockRestore();
  });
});
