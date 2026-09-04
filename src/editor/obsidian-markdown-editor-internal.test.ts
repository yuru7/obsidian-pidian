import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createFakeEl } = vi.hoisted(() => {
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
    style: Record<string, string>;
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
      style: {},
      createDiv(opts) {
        return el.createEl("div", opts);
      },
      createEl(childTag, opts) {
        const child = createFakeEl(childTag);
        if (opts?.cls) {
          child.className = opts.cls;
        }
        if (opts?.attr?.rows) {
          child.value = child.value;
        }
        child.parent = el;
        el.children.push(child);
        return child;
      },
      addClass(name) {
        const parts = new Set(el.className.split(/\s+/).filter(Boolean));
        parts.add(name);
        el.className = [...parts].join(" ");
      },
      removeClass(name) {
        const parts = new Set(el.className.split(/\s+/).filter(Boolean));
        parts.delete(name);
        el.className = [...parts].join(" ");
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

  return { createFakeEl };
});

import type { App } from "obsidian";
import {
  createMarkdownEditorOwner,
  getMarkdownEditorConstructor,
  resetMarkdownEditorConstructorCache,
} from "./obsidian-markdown-editor-internal";

class MarkdownScrollableEditView {}
class IFramedMarkdownEditor extends MarkdownScrollableEditView {}

function fakeApp(md: unknown): App {
  return {
    embedRegistry: {
      embedByExtension: { md },
    },
  } as unknown as App;
}

describe("getMarkdownEditorConstructor", () => {
  beforeEach(() => {
    resetMarkdownEditorConstructorCache();
    vi.stubGlobal("createDiv", () => createFakeEl());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when embedRegistry is missing", () => {
    expect(getMarkdownEditorConstructor({} as App)).toBeNull();
  });

  it("returns the scrollable editor constructor from editMode's prototype chain", () => {
    const embed = {
      editable: false,
      editMode: new IFramedMarkdownEditor(),
      load: vi.fn(),
      showEditor: vi.fn(),
      unload: vi.fn(),
    };
    const ctor = getMarkdownEditorConstructor(
      fakeApp((_info: unknown, _file: unknown, _subpath: unknown) => {
        embed.editable = true;
        return embed;
      }),
    );
    expect(ctor).toBe(MarkdownScrollableEditView);
    expect(embed.editable).toBe(true);
    expect(embed.showEditor).toHaveBeenCalledOnce();
    expect(embed.unload).toHaveBeenCalledOnce();
  });

  it("unloads the temporary embed when showEditor throws", () => {
    const embed = {
      unload: vi.fn(),
      showEditor: () => {
        throw new Error("boom");
      },
    };
    expect(getMarkdownEditorConstructor(fakeApp(() => embed))).toBeNull();
    expect(embed.unload).toHaveBeenCalledOnce();
  });

  it("does not throw when the embed creator fails", () => {
    expect(
      getMarkdownEditorConstructor(
        fakeApp(() => {
          throw new Error("missing");
        }),
      ),
    ).toBeNull();
  });

  it("caches a successful constructor so later calls skip the temp embed", () => {
    const createEmbed = vi.fn(() => ({
      editMode: new IFramedMarkdownEditor(),
      showEditor: vi.fn(),
      unload: vi.fn(),
    }));
    const app = fakeApp(createEmbed);
    expect(getMarkdownEditorConstructor(app)).toBe(MarkdownScrollableEditView);
    expect(getMarkdownEditorConstructor(app)).toBe(MarkdownScrollableEditView);
    expect(createEmbed).toHaveBeenCalledOnce();
  });
});

describe("createMarkdownEditorOwner", () => {
  it("is a source-mode owner with no vault file", () => {
    const app = {} as App;
    const owner = createMarkdownEditorOwner(app);
    expect(owner.app).toBe(app);
    expect(owner.getMode()).toBe("source");
    expect(owner.getViewType()).toBe("pidian-input");
    expect(owner.file).toBeNull();
    expect(owner.path).toBe("");
  });
});
