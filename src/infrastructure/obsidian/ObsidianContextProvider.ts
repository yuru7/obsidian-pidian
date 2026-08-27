import { MarkdownView, type App } from "obsidian";
import type { ContextSnapshot, SelectionContext } from "../../domain/notes/ContextSnapshot";
import type { ContextProvider } from "../../application/ContextService";

const EXCERPT_RADIUS = 5;

export class ObsidianContextProvider implements ContextProvider {
  constructor(private readonly app: App) {}

  getActiveNote(): ContextSnapshot | undefined {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      return undefined;
    }
    const editor = view.editor;
    const noteContent = editor.getValue();
    const selected = editor.getSelection();
    const snapshot: ContextSnapshot = {
      notePath: view.file.path,
      noteContent,
    };
    if (selected.length > 0) {
      snapshot.selection = selectionContext(noteContent, editor.getCursor("from").line, editor.getCursor("to").line, selected);
    }
    return snapshot;
  }
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
