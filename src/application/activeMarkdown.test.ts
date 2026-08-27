import { describe, expect, it } from "vitest";
import { pickMarkdownSource, snapshotFromEditorSource } from "./activeMarkdown";

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

describe("snapshotFromEditorSource", () => {
  it("keeps the editor content and selection", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      noteContent: "a\nb\nc\nd\ne\nf\ng",
      selectedText: "c",
      selectionFromLine: 2,
      selectionToLine: 2,
    });
    expect(snapshot.notePath).toBe("notes/example.md");
    expect(snapshot.noteContent).toBe("a\nb\nc\nd\ne\nf\ng");
    expect(snapshot.selection).toMatchObject({
      text: "c",
      startLine: 3,
      endLine: 3,
    });
    expect(snapshot.selection?.excerpt).toContain("c");
  });

  it("omits selection when nothing is selected", () => {
    const snapshot = snapshotFromEditorSource({
      notePath: "notes/example.md",
      noteContent: "hello",
      selectedText: "",
      selectionFromLine: 0,
      selectionToLine: 0,
    });
    expect(snapshot.selection).toBeUndefined();
  });
});
