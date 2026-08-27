export interface Replacement {
  oldText: string;
  newText: string;
}

export interface NoteEditor {
  applyReplacements(path: string, replacements: Replacement[]): Promise<string>;
}
