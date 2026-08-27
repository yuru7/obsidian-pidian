import { MarkdownView, type App, type Editor } from "obsidian";
import { NOTE_NOT_ACTIVE_EDITOR, type NoteEditor, type Replacement } from "../../domain/notes/NoteEditor";
import {
  applyReplacementsToText,
  type ReplacementResult,
} from "../../application/replacements";

export class ObsidianNoteEditor implements NoteEditor {
  constructor(private readonly app: App) {}

  async requireActive(path: string): Promise<void> {
    await this.activeEditor(path);
  }

  async applyReplacements(path: string, replacements: Replacement[]): Promise<string> {
    const editor = await this.activeEditor(path);
    return applyToEditor(editor, replacements);
  }

  private async activeEditor(path: string): Promise<Editor> {
    const leaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    if (leaf?.isDeferred) {
      await leaf.loadIfDeferred();
    }
    const recent = leaf?.view;
    if (recent instanceof MarkdownView && recent.file?.path === path) {
      return recent.editor;
    }
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === path) {
      return active.editor;
    }
    throw new Error(NOTE_NOT_ACTIVE_EDITOR);
  }
}

function applyToEditor(editor: Editor, replacements: Replacement[]): string {
  const current = editor.getValue();
  const applied: ReplacementResult = applyReplacementsToText(current, replacements);
  if (!applied.ok) {
    throw new Error(applied.error);
  }
  const lastLine = editor.lastLine();
  editor.transaction({
    changes: [
      {
        from: { line: 0, ch: 0 },
        to: { line: lastLine, ch: editor.getLine(lastLine).length },
        text: applied.content,
      },
    ],
  });
  return editor.getValue();
}
