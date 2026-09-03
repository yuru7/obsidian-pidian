import { describe, expect, it } from "vitest";
import {
  formatLineRange,
  pickMarkdownSource,
  pickMarkdownSourceForPath,
  snapshotFromEditorSource,
} from "./activeMarkdown";

describe("pickMarkdownSource", () => {
  it("skips empty sources and keeps the first note with a path", () => {
    const picked = pickMarkdownSource([
      undefined,
      { notePath: "" },
      { notePath: "notes/current.md", label: "sidebar-fallback" },
      { notePath: "notes/other.md", label: "later" },
    ]);
    expect(picked).toEqual({ notePath: "notes/current.md", label: "sidebar-fallback" });
  });

  it("returns undefined when no markdown source exists", () => {
    expect(pickMarkdownSource([undefined, { notePath: "" }])).toBeUndefined();
  });
});

describe("pickMarkdownSourceForPath", () => {
  it("ignores an editor whose file does not match the active path", () => {
    expect(
      pickMarkdownSourceForPath("draw/box.excalidraw.md", [
        { notePath: "notes/a.md" },
        { notePath: "draw/box.excalidraw.md" },
      ]),
    ).toEqual({ notePath: "draw/box.excalidraw.md" });
  });

  it("returns undefined when no editor matches the path", () => {
    expect(pickMarkdownSourceForPath("draw/box.excalidraw.md", [{ notePath: "notes/a.md" }])).toBeUndefined();
  });
});

describe("snapshotFromEditorSource", () => {
  it("converts the cursor line to a 1-based range without columns", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      fromLine: 11,
      toLine: 11,
      fromColumn: 4,
      toColumn: 4,
    });
    expect(snapshot).toEqual({
      notePath: "notes/example.md",
      startLine: 12,
      endLine: 12,
    });
  });

  it("keeps a multi-line selection range with 1-based columns", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      fromLine: 2,
      toLine: 4,
      fromColumn: 3,
      toColumn: 2,
    });
    expect(snapshot).toEqual({
      notePath: "notes/example.md",
      startLine: 3,
      endLine: 5,
      startColumn: 4,
      endColumn: 3,
    });
  });

  it("keeps a same-line selection with columns", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      fromLine: 2,
      toLine: 2,
      fromColumn: 3,
      toColumn: 9,
    });
    expect(snapshot).toEqual({
      notePath: "notes/example.md",
      startLine: 3,
      endLine: 3,
      startColumn: 4,
      endColumn: 10,
    });
  });
});

describe("formatLineRange", () => {
  it("formats a single line cursor", () => {
    expect(formatLineRange({ startLine: 12, endLine: 12 })).toBe("L12");
  });

  it("formats a multi-line selection without columns", () => {
    expect(formatLineRange({ startLine: 13, endLine: 15 })).toBe("L13-L15");
  });

  it("formats a selection with columns", () => {
    expect(
      formatLineRange({ startLine: 3, endLine: 5, startColumn: 4, endColumn: 3 }),
    ).toBe("L3:C4-L5:C3");
  });

  it("formats a same-line selection with columns", () => {
    expect(
      formatLineRange({ startLine: 3, endLine: 3, startColumn: 4, endColumn: 10 }),
    ).toBe("L3:C4-L3:C10");
  });

  it("omits columns when the range is a collapsed cursor", () => {
    expect(
      formatLineRange({ startLine: 3, endLine: 3, startColumn: 4, endColumn: 4 }),
    ).toBe("L3");
  });
});
