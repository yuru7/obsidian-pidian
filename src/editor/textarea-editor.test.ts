import { describe, expect, it, vi } from "vitest";
import { createTextareaEditor } from "./textarea-editor";

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
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  createEl: (tag: string, opts?: { cls?: string; attr?: Record<string, string> }) => FakeEl;
  addClass: (name: string) => void;
  removeClass: (name: string) => void;
  empty: () => void;
  replaceChildren: () => void;
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
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
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
    empty() {
      el.children = [];
    },
    replaceChildren() {
      el.children = [];
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

function textareaOf(host: FakeEl): FakeEl {
  const child = host.children[0];
  if (!child) {
    throw new Error("missing textarea");
  }
  return child;
}

describe("createTextareaEditor", () => {
  it("creates a textarea and reads and writes its value", () => {
    const host = createFakeEl();
    const editor = createTextareaEditor(host as unknown as HTMLElement);
    const textarea = textareaOf(host);
    expect(textarea.className).toContain("pidian-input");
    expect(editor.getValue()).toBe("");
    editor.setValue("hello");
    expect(editor.getValue()).toBe("hello");
    expect(textarea.selectionStart).toBe(5);
  });

  it("inserts text at the cursor and can clear", () => {
    const host = createFakeEl();
    const editor = createTextareaEditor(host as unknown as HTMLElement);
    editor.setValue("ac");
    const textarea = textareaOf(host);
    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    editor.insertText("b");
    expect(editor.getValue()).toBe("abc");
    editor.setValue("abc");
    editor.newline();
    expect(editor.getValue()).toBe("abc\n");
    editor.clear();
    expect(editor.getValue()).toBe("");
  });

  it("scrolls the caret into view after a newline when the textarea overflows", () => {
    const host = createFakeEl();
    const editor = createTextareaEditor(host as unknown as HTMLElement);
    const textarea = textareaOf(host);
    textarea.value = "a\n".repeat(12);
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    textarea.clientHeight = 160;
    textarea.scrollHeight = 400;
    textarea.scrollTop = 80;
    editor.newline();
    expect(textarea.scrollTop).toBe(240);
  });

  it("does not adjust scroll when inserting a character into an overflowing textarea", () => {
    const host = createFakeEl();
    const editor = createTextareaEditor(host as unknown as HTMLElement);
    const textarea = textareaOf(host);
    textarea.value = "a\n".repeat(12);
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    textarea.clientHeight = 160;
    textarea.scrollHeight = 400;
    textarea.scrollTop = 80;
    editor.insertText("x");
    expect(textarea.scrollTop).toBe(80);
  });

  it("does not adjust scroll on arrow-key keyup", () => {
    const host = createFakeEl();
    const editor = createTextareaEditor(host as unknown as HTMLElement);
    const textarea = textareaOf(host);
    textarea.value = "a\n".repeat(12);
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    textarea.clientHeight = 160;
    textarea.scrollHeight = 400;
    textarea.scrollTop = 80;
    for (const listener of textarea.listeners.get("keyup") ?? []) {
      if (typeof listener === "function") {
        listener({ key: "ArrowDown" } as Event);
      }
    }
    expect(textarea.scrollTop).toBe(80);
    editor.destroy();
  });

  it("focuses unless disabled", () => {
    const host = createFakeEl();
    const editor = createTextareaEditor(host as unknown as HTMLElement);
    editor.focus();
    expect(textareaOf(host).focused).toBe(true);
    editor.setDisabled(true);
    textareaOf(host).focused = false;
    editor.focus();
    expect(textareaOf(host).focused).toBe(false);
    expect(textareaOf(host).disabled).toBe(true);
  });

  it("emits onChange and removes the textarea on destroy", () => {
    const host = createFakeEl();
    const onChange = vi.fn();
    const editor = createTextareaEditor(host as unknown as HTMLElement, { onChange });
    editor.setValue("x");
    expect(onChange).toHaveBeenCalledWith("x");
    const textarea = textareaOf(host);
    editor.destroy();
    expect(host.children).toHaveLength(0);
    expect(textarea.listeners.get("input")?.size ?? 0).toBe(0);
    expect(textarea.listeners.get("paste")?.size ?? 0).toBe(0);
  });

  it("emits onChange after paste when the native input event is skipped", () => {
    vi.useFakeTimers();
    try {
      const host = createFakeEl();
      const onChange = vi.fn();
      const editor = createTextareaEditor(host as unknown as HTMLElement, { onChange });
      const textarea = textareaOf(host);
      textarea.value = "pasted";
      for (const listener of textarea.listeners.get("paste") ?? []) {
        if (typeof listener === "function") {
          listener(new Event("paste"));
        }
      }
      expect(onChange).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(onChange).toHaveBeenCalledWith("pasted");
      editor.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
