import { EditorView } from "@codemirror/view";

/**
 * Workspace events do not fire on selection-only changes.
 * Obsidian documents CodeMirror view plugins / update listeners for
 * "when the user entered or selected some text".
 */
export function editorContextExtension(onChange: () => void) {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.docChanged) {
      onChange();
    }
  });
}
