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
  it("converts the cursor line to a 1-based range", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      fromLine: 11,
      toLine: 11,
    });
    expect(snapshot).toEqual({
      notePath: "notes/example.md",
      startLine: 12,
      endLine: 12,
    });
  });

  it("keeps a multi-line selection range", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      fromLine: 12,
      toLine: 14,
    });
    expect(snapshot).toEqual({
      notePath: "notes/example.md",
      startLine: 13,
      endLine: 15,
    });
  });
});

describe("formatLineRange", () => {
  it("formats a single line", () => {
    expect(formatLineRange(12, 12)).toBe("L12");
  });

  it("formats a multi-line selection", () => {
    expect(formatLineRange(13, 15)).toBe("L13-L15");
  });
});
