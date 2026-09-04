import type { App, TFile } from "obsidian";

/**
 * Public `MarkdownView` needs a WorkspaceLeaf, so it cannot live inside the
 * Pidian composer. There is no public API for a standalone Live Preview
 * editor. This file is the only place that reads `app.embedRegistry` and
 * `editMode` prototypes.
 *
 * Compatibility: Obsidian can change the embed constructor or the prototype
 * chain. Callers must treat a `null` result as "use textarea".
 */

export type MarkdownEditorOwner = {
  app: App;
  showSearch: () => void;
  toggleMode: () => void;
  onMarkdownScroll: () => void;
  getMode: () => "source";
  getViewType: () => string;
  id: string;
  scroll: number;
  editMode: unknown;
  readonly file: TFile | null;
  readonly path: string;
};

export type MarkdownEditorInstance = {
  editor?: {
    getValue(): string;
    setValue(value: string): void;
    replaceSelection(replacement: string, origin?: string): void;
    focus(): void;
    setCursor?(pos: { line: number; ch: number } | number, ch?: number): void;
    lastLine?(): number;
    getLine?(line: number): string;
    exec?(command: string): void;
    cm?: { contentDOM?: HTMLElement };
  };
  containerEl?: HTMLElement;
  editorEl?: HTMLElement;
  set?(data: string, clear?: boolean): void;
  load?(): void;
  unload?(): void;
  destroy?(): void;
};

export type MarkdownEditorConstructor = new (
  app: App,
  containerEl: HTMLElement,
  owner: MarkdownEditorOwner,
) => MarkdownEditorInstance;

type MarkdownEmbed = {
  editable?: boolean;
  editMode?: object;
  load?: () => void;
  showEditor?: () => void;
  unload?: () => void;
};

type EmbedCreator = (
  info: { app: App; containerEl: HTMLElement },
  file: TFile | null,
  subpath: string,
) => unknown;

type AppWithEmbedRegistry = App & {
  embedRegistry?: {
    embedByExtension?: {
      md?: EmbedCreator;
    };
  };
};

let cachedConstructor: MarkdownEditorConstructor | null = null;

export function resetMarkdownEditorConstructorCache(): void {
  cachedConstructor = null;
}

export function getMarkdownEditorConstructor(app: App): MarkdownEditorConstructor | null {
  if (cachedConstructor) {
    return cachedConstructor;
  }
  const resolved = resolveMarkdownEditorConstructor(app);
  if (resolved) {
    cachedConstructor = resolved;
  }
  return resolved;
}

export function createMarkdownEditorOwner(app: App): MarkdownEditorOwner {
  return {
    app,
    showSearch() {},
    toggleMode() {},
    onMarkdownScroll() {},
    getMode() {
      return "source";
    },
    getViewType() {
      return "pidian-input";
    },
    id: "pidian-input",
    scroll: 0,
    editMode: null,
    get file() {
      return null;
    },
    get path() {
      return "";
    },
  };
}

function resolveMarkdownEditorConstructor(app: App): MarkdownEditorConstructor | null {
  try {
    const createEmbed = (app as AppWithEmbedRegistry).embedRegistry?.embedByExtension?.md;
    if (typeof createEmbed !== "function") {
      return null;
    }
    const host = createDiv();
    const embed = asEmbed(createEmbed({ app, containerEl: host }, null, ""));
    if (!embed) {
      return null;
    }
    try {
      embed.load?.();
      embed.editable = true;
      embed.showEditor?.();
      const ctor = constructorFromEditMode(embed.editMode);
      return ctor;
    } finally {
      try {
        embed.unload?.();
      } catch {
        // Temporary embed must not leak, but unload itself can throw on some builds.
      }
    }
  } catch {
    return null;
  }
}

function asEmbed(value: unknown): MarkdownEmbed | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as MarkdownEmbed;
}

/**
 * `editMode` is typically an IFramedMarkdownEditor instance. Two steps up the
 * prototype chain is MarkdownScrollableEditView, which is the constructor we
 * can `new` with `(app, container, owner)`. One step is tried if that fails.
 */
function constructorFromEditMode(editMode: object | undefined): MarkdownEditorConstructor | null {
  if (!editMode) {
    return null;
  }
  const framed = Object.getPrototypeOf(editMode) as object | null;
  const scrollable = framed ? (Object.getPrototypeOf(framed) as object | null) : null;
  for (const proto of [scrollable, framed]) {
    const ctor = proto && (proto as { constructor?: unknown }).constructor;
    if (isEditorConstructor(ctor)) {
      return ctor;
    }
  }
  return null;
}

function isEditorConstructor(value: unknown): value is MarkdownEditorConstructor {
  return typeof value === "function" && value !== Object && value !== Function;
}
