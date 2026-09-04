import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { MarkdownEditorConstructor, MarkdownEditorInstance } from "./obsidian-markdown-editor-internal";

const { FakeMarkdownEditor, getMarkdownEditorConstructor } = vi.hoisted(() => {
  class FakeMarkdownEditor {
    static instances: FakeMarkdownEditor[] = [];
    editor: MarkdownEditorInstance["editor"];
    containerEl: HTMLElement;
    unloaded = false;
    value = "";
    focused = false;
    owner: unknown;
    exec = vi.fn();
    dispatched: unknown[] = [];

    constructor(app: App, containerEl: HTMLElement, owner: unknown) {
      this.containerEl = containerEl;
      this.owner = owner;
      FakeMarkdownEditor.instances.push(this);
      this.editor = {
        getValue: () => this.value,
        setValue: (next: string) => {
          this.value = next;
        },
        replaceSelection: (text: string) => {
          this.value += text;
        },
        focus: () => {
          this.focused = true;
        },
        setCursor: () => {},
        lastLine: () => 0,
        getLine: () => this.value,
        exec: this.exec,
        cm: {
          contentDOM: {
            dispatchEvent: (event: Event) => {
              this.dispatched.push(event);
              return true;
            },
          } as HTMLElement,
        },
      };
    }

    set(data: string): void {
      this.value = data;
    }

    load(): void {}

    unload(): void {
      this.unloaded = true;
    }
  }

  return {
    FakeMarkdownEditor,
    getMarkdownEditorConstructor: vi.fn(),
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
  createDiv: () => ({}),
}));

import { createObsidianLiveEditor } from "./obsidian-live-editor";

type Listener = EventListenerOrEventListenerObject;

type FakeEl = {
  className: string;
  children: unknown[];
  listeners: Map<string, Set<Listener>>;
  inert: boolean;
  addClass: (name: string) => void;
  removeClass: (name: string) => void;
  toggleClass: (name: string, force: boolean) => void;
  empty: () => void;
  replaceChildren: () => void;
  contains: () => boolean;
  append: () => void;
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
};

function createHost(): FakeEl {
  const el: FakeEl = {
    className: "",
    children: [],
    listeners: new Map(),
    inert: false,
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
    contains() {
      return false;
    },
    append() {},
    addEventListener(type, listener) {
      const set = el.listeners.get(type) ?? new Set();
      set.add(listener);
      el.listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      el.listeners.get(type)?.delete(listener);
    },
  };
  return el;
}

describe("createObsidianLiveEditor", () => {
  beforeEach(() => {
    FakeMarkdownEditor.instances = [];
    getMarkdownEditorConstructor.mockReturnValue(FakeMarkdownEditor as unknown as MarkdownEditorConstructor);
  });

  it("mounts an editor that can get, set, insert, and clear text", () => {
    const host = createHost();
    const editor = createObsidianLiveEditor({} as App, host as unknown as HTMLElement);
    const instance = FakeMarkdownEditor.instances[0];
    expect(instance).toBeDefined();
    expect(host.className).toContain("has-live-editor");
    expect(editor.getValue()).toBe("");
    editor.setValue("note");
    expect(editor.getValue()).toBe("note");
    editor.insertText("!");
    expect(editor.getValue()).toBe("note!");
    editor.clear();
    expect(editor.getValue()).toBe("");
  });

  it("focuses unless disabled, and unloads on destroy", () => {
    const host = createHost();
    const editor = createObsidianLiveEditor({} as App, host as unknown as HTMLElement);
    const instance = FakeMarkdownEditor.instances[0];
    expect(instance).toBeDefined();
    editor.focus();
    expect(instance?.focused).toBe(true);
    editor.setDisabled(true);
    expect(host.inert).toBe(true);
    instance!.focused = false;
    editor.focus();
    expect(instance?.focused).toBe(false);
    editor.destroy();
    expect(instance?.unloaded).toBe(true);
    expect(host.listeners.get("input")?.size ?? 0).toBe(0);
    expect(host.className).not.toContain("has-live-editor");
  });

  it("throws when the constructor is unavailable", () => {
    getMarkdownEditorConstructor.mockReturnValue(null);
    expect(() => createObsidianLiveEditor({} as App, createHost() as unknown as HTMLElement)).toThrow(
      /unavailable/,
    );
  });

  it("replays a plain Enter onto CodeMirror so lists continue", () => {
    class FakeKeyboardEvent {
      key: string;
      shiftKey: boolean;
      constructor(public type: string, init: KeyboardEventInit = {}) {
        this.key = init.key ?? "";
        this.shiftKey = Boolean(init.shiftKey);
      }
    }
    vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
    const host = createHost();
    const editor = createObsidianLiveEditor({} as App, host as unknown as HTMLElement);
    const instance = FakeMarkdownEditor.instances[0];
    editor.newline();
    expect(instance?.exec).not.toHaveBeenCalled();
    const event = instance?.dispatched[0] as { type: string; key: string; shiftKey: boolean } | undefined;
    expect(event?.type).toBe("keydown");
    expect(event?.key).toBe("Enter");
    expect(event?.shiftKey).toBe(false);
    vi.unstubAllGlobals();
  });

  it("falls back to exec when KeyboardEvent cannot be constructed", () => {
    vi.stubGlobal("KeyboardEvent", function Broken() {
      throw new Error("no KeyboardEvent");
    });
    const host = createHost();
    const editor = createObsidianLiveEditor({} as App, host as unknown as HTMLElement);
    const instance = FakeMarkdownEditor.instances[0];
    editor.newline();
    expect(instance?.exec).toHaveBeenCalledWith("newlineAndIndent");
    vi.unstubAllGlobals();
  });
});
