import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/**
 * Workaround: Obsidian / CodeMirror hide the Markdown editor's selection when
 * the editor loses focus (Pidian composer, another pane, etc.). Native
 * `::selection` is cleared on blur, so CSS on `.cm-selectionBackground` is not
 * enough. This paints the current non-empty ranges with a mark decoration
 * while the editor is unfocused.
 *
 * Temporary. If Obsidian starts drawing unfocused selections itself, delete:
 * this file, `unfocusedSelectionHighlight.test.ts`, `.pidian-unfocused-selection`
 * in `styles.css`, and the `registerEditorExtension` call in `main.ts`.
 */
export const UNFOCUSED_SELECTION_CLASS = "pidian-unfocused-selection";

const selectionMark = Decoration.mark({ class: UNFOCUSED_SELECTION_CLASS });

export function unfocusedSelectionRanges(
  hasFocus: boolean,
  ranges: readonly { from: number; to: number }[],
): Array<{ from: number; to: number }> {
  if (hasFocus) {
    return [];
  }
  return ranges
    .map((range) => ({
      from: Math.min(range.from, range.to),
      to: Math.max(range.from, range.to),
    }))
    .filter((range) => range.to > range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
}

export function unfocusedSelectionDecorations(
  hasFocus: boolean,
  ranges: readonly { from: number; to: number }[],
): DecorationSet {
  return Decoration.set(
    unfocusedSelectionRanges(hasFocus, ranges).map((range) => selectionMark.range(range.from, range.to)),
    true,
  );
}

function decorationsForView(view: EditorView): DecorationSet {
  return unfocusedSelectionDecorations(view.hasFocus, view.state.selection.ranges);
}

export function unfocusedSelectionHighlight() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = decorationsForView(view);
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged || update.focusChanged) {
          this.decorations = decorationsForView(update.view);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
}
