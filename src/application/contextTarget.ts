import type { MarkdownEditorSource } from "./activeMarkdown";

export interface ContextFileRef {
  path: string;
  /** True when `TFile.extension` is `md`, including custom views such as Excalidraw. */
  markdownExtension: boolean;
}

export type ContextTarget =
  | { kind: "markdown"; source: MarkdownEditorSource }
  | { kind: "path"; notePath: string };

/**
 * Pick the chat context file from the visible editor tab, then from an embedded
 * Markdown editor (Canvas card), then from the last remembered file.
 *
 * A `.md` tab that is not a MarkdownView (Excalidraw, Kanban, …) is path-only.
 * Do not reuse another tab's `activeEditor`.
 */
export function resolveContextTarget(input: {
  visibleFile?: ContextFileRef;
  visibleMarkdown?: MarkdownEditorSource;
  activeFile?: ContextFileRef;
  activeMarkdown?: MarkdownEditorSource;
  lastMarkdown?: MarkdownEditorSource;
  lastPathOnly?: string;
}): ContextTarget | undefined {
  const visibleFile = input.visibleFile;
  if (visibleFile) {
    if (visibleFile.markdownExtension) {
      if (input.visibleMarkdown?.notePath === visibleFile.path) {
        return { kind: "markdown", source: input.visibleMarkdown };
      }
      return { kind: "path", notePath: visibleFile.path };
    }
    if (input.activeFile && input.activeMarkdown?.notePath === input.activeFile.path) {
      return { kind: "markdown", source: input.activeMarkdown };
    }
    return { kind: "path", notePath: visibleFile.path };
  }

  if (input.activeFile?.markdownExtension && input.activeMarkdown?.notePath === input.activeFile.path) {
    return { kind: "markdown", source: input.activeMarkdown };
  }
  if (input.activeFile && !input.activeFile.markdownExtension) {
    return { kind: "path", notePath: input.activeFile.path };
  }

  if (input.lastMarkdown) {
    return { kind: "markdown", source: input.lastMarkdown };
  }
  if (input.lastPathOnly) {
    return { kind: "path", notePath: input.lastPathOnly };
  }
  return undefined;
}
