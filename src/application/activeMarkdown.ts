import type { ContextSnapshot, SelectionContext } from "../domain/notes/ContextSnapshot";

const EXCERPT_RADIUS = 5;

export interface MarkdownEditorSource {
  notePath: string;
  noteContent: string;
  selectedText: string;
  selectionFromLine: number;
  selectionToLine: number;
}

export function pickMarkdownSource<T extends { notePath: string }>(
  sources: Array<T | undefined>,
): T | undefined {
  for (const source of sources) {
    if (source?.notePath) {
      return source;
    }
  }
  return undefined;
}

export function snapshotFromEditorSource(source: MarkdownEditorSource): ContextSnapshot {
  const snapshot: ContextSnapshot = {
    notePath: source.notePath,
    noteContent: source.noteContent,
  };
  if (source.selectedText.length > 0) {
    snapshot.selection = selectionContext(
      source.noteContent,
      source.selectionFromLine,
      source.selectionToLine,
      source.selectedText,
    );
  }
  return snapshot;
}

function selectionContext(
  content: string,
  fromLine: number,
  toLine: number,
  text: string,
): SelectionContext {
  const lines = content.split("\n");
  const startLine = fromLine + 1;
  const endLine = toLine + 1;
  const excerptStart = Math.max(0, fromLine - EXCERPT_RADIUS);
  const excerptEnd = Math.min(lines.length, toLine + 1 + EXCERPT_RADIUS);
  return {
    text,
    startLine,
    endLine,
    excerpt: lines.slice(excerptStart, excerptEnd).join("\n"),
  };
}
