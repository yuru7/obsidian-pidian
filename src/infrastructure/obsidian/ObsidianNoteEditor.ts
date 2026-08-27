import { MarkdownView, TFile, type App, type Editor, type WorkspaceLeaf } from "obsidian";
import type { NoteEditor, Replacement } from "../../domain/notes/NoteEditor";
import {
  applyReplacementsToText,
  type ReplacementResult,
} from "../../application/replacements";
import {
  EditorLeaseManager,
  type EditorLease,
} from "../../application/EditorLeaseManager";

export class ObsidianNoteEditor implements NoteEditor {
  private readonly leases: EditorLeaseManager;
  private readonly ownedLeaves = new Map<string, WorkspaceLeaf>();

  constructor(
    private readonly app: App,
    getMaxNotes: () => number,
  ) {
    this.leases = new EditorLeaseManager((path) => this.openLease(path), getMaxNotes);
  }

  async applyReplacements(path: string, replacements: Replacement[]): Promise<string> {
    const existing = this.findOpenEditor(path);
    if (existing) {
      return applyToEditor(existing, replacements);
    }
    const lease = await this.leases.acquire(path);
    return lease.applyReplacements(replacements);
  }

  dispose(): void {
    for (const leaf of this.ownedLeaves.values()) {
      leaf.detach();
    }
    this.ownedLeaves.clear();
    this.leases.releaseAll();
  }

  private findOpenEditor(path: string): Editor | undefined {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === path) {
        return view.editor;
      }
    }
    return undefined;
  }

  private async openLease(path: string): Promise<EditorLease> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${path}`);
    }

    const previous = this.app.workspace.getMostRecentLeaf();
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: false });
    if (previous) {
      this.app.workspace.setActiveLeaf(previous, { focus: false });
    }

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      leaf.detach();
      throw new Error(`Could not open ${path} in a Markdown editor.`);
    }
    this.ownedLeaves.set(path, leaf);
    const editor = view.editor;
    return {
      path,
      getContent: () => editor.getValue(),
      applyReplacements: async (replacements) => applyToEditor(editor, replacements),
    };
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
