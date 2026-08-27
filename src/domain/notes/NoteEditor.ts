export interface Replacement {
  oldText: string;
  newText: string;
}

export const NOTE_NOT_ACTIVE_EDITOR =
  "The note is not the active editor. Open it with open_file, or focus it with workspace_tabs, then edit.";

export interface NoteEditor {
  requireActive(path: string): Promise<void>;
  applyReplacements(path: string, replacements: Replacement[]): Promise<string>;
}
