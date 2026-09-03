import { describe, expect, it } from "vitest";
import {
  UNFOCUSED_SELECTION_CLASS,
  unfocusedSelectionDecorations,
  unfocusedSelectionRanges,
} from "./unfocusedSelectionHighlight";

function collect(hasFocus: boolean, ranges: Array<{ from: number; to: number }>): Array<{ from: number; to: number; className: string }> {
  const found: Array<{ from: number; to: number; className: string }> = [];
  unfocusedSelectionDecorations(hasFocus, ranges).between(0, Number.MAX_SAFE_INTEGER, (from, to, decoration) => {
    found.push({ from, to, className: decoration.spec.class ?? "" });
  });
  return found;
}

describe("unfocusedSelectionRanges", () => {
  it("returns nothing while the editor is focused", () => {
    expect(unfocusedSelectionRanges(true, [{ from: 2, to: 8 }])).toEqual([]);
  });

  it("drops collapsed cursors", () => {
    expect(unfocusedSelectionRanges(false, [{ from: 4, to: 4 }])).toEqual([]);
  });

  it("keeps a non-empty range when unfocused", () => {
    expect(unfocusedSelectionRanges(false, [{ from: 2, to: 8 }])).toEqual([{ from: 2, to: 8 }]);
  });

  it("normalizes inverted ranges and sorts them", () => {
    expect(
      unfocusedSelectionRanges(false, [
        { from: 20, to: 12 },
        { from: 1, to: 4 },
      ]),
    ).toEqual([
      { from: 1, to: 4 },
      { from: 12, to: 20 },
    ]);
  });
});

describe("unfocusedSelectionDecorations", () => {
  it("marks unfocused ranges with the workaround class", () => {
    expect(collect(false, [{ from: 2, to: 8 }])).toEqual([
      { from: 2, to: 8, className: UNFOCUSED_SELECTION_CLASS },
    ]);
  });

  it("does not mark a focused editor", () => {
    expect(collect(true, [{ from: 2, to: 8 }])).toEqual([]);
  });
});
