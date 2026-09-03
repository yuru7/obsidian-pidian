import { describe, expect, it } from "vitest";
import { resolveContextTarget } from "./contextTarget";
import type { MarkdownEditorSource } from "./activeMarkdown";

function markdown(
  notePath: string,
  fromLine = 0,
  toLine = 0,
  fromColumn = 0,
  toColumn = 0,
): MarkdownEditorSource {
  return { notePath, fromLine, toLine, fromColumn, toColumn };
}

describe("resolveContextTarget", () => {
  it("uses the visible Markdown editor", () => {
    expect(
      resolveContextTarget({
        visibleFile: { path: "notes/a.md", markdownExtension: true },
        visibleMarkdown: markdown("notes/a.md", 3, 5),
        activeFile: { path: "notes/a.md", markdownExtension: true },
        activeMarkdown: markdown("notes/a.md", 3, 5),
      }),
    ).toEqual({ kind: "markdown", source: markdown("notes/a.md", 3, 5) });
  });

  it("keeps a .md custom view as path-only instead of another tab's editor", () => {
    expect(
      resolveContextTarget({
        visibleFile: { path: "draw/box.excalidraw.md", markdownExtension: true },
        activeFile: { path: "draw/box.excalidraw.md", markdownExtension: true },
        activeMarkdown: markdown("notes/a.md", 2, 2),
        lastMarkdown: markdown("notes/a.md", 2, 2),
      }),
    ).toEqual({ kind: "path", notePath: "draw/box.excalidraw.md" });
  });

  it("keeps the visible custom .md tab after the sidebar steals getActiveFile", () => {
    expect(
      resolveContextTarget({
        visibleFile: { path: "draw/box.excalidraw.md", markdownExtension: true },
        activeFile: { path: "notes/a.md", markdownExtension: true },
        activeMarkdown: markdown("notes/a.md", 2, 2),
        lastMarkdown: markdown("notes/a.md", 2, 2),
      }),
    ).toEqual({ kind: "path", notePath: "draw/box.excalidraw.md" });
  });

  it("uses a Canvas or image tab as path-only", () => {
    expect(
      resolveContextTarget({
        visibleFile: { path: "maps/board.canvas", markdownExtension: false },
        activeFile: { path: "maps/board.canvas", markdownExtension: false },
        lastMarkdown: markdown("notes/a.md"),
      }),
    ).toEqual({ kind: "path", notePath: "maps/board.canvas" });
  });

  it("uses an embedded Markdown editor on Canvas", () => {
    expect(
      resolveContextTarget({
        visibleFile: { path: "maps/board.canvas", markdownExtension: false },
        activeFile: { path: "notes/card.md", markdownExtension: true },
        activeMarkdown: markdown("notes/card.md", 1, 1),
      }),
    ).toEqual({ kind: "markdown", source: markdown("notes/card.md", 1, 1) });
  });

  it("does not use a leftover Markdown editor when Canvas is showing", () => {
    expect(
      resolveContextTarget({
        visibleFile: { path: "maps/board.canvas", markdownExtension: false },
        activeFile: { path: "maps/board.canvas", markdownExtension: false },
        activeMarkdown: markdown("notes/a.md"),
      }),
    ).toEqual({ kind: "path", notePath: "maps/board.canvas" });
  });

  it("falls back to the last Markdown editor when no file tab is visible", () => {
    expect(
      resolveContextTarget({
        lastMarkdown: markdown("notes/a.md", 8, 8),
        lastPathOnly: "maps/board.canvas",
      }),
    ).toEqual({ kind: "markdown", source: markdown("notes/a.md", 8, 8) });
  });

  it("falls back to the last path-only file when no editor remains", () => {
    expect(resolveContextTarget({ lastPathOnly: "draw/box.excalidraw.md" })).toEqual({
      kind: "path",
      notePath: "draw/box.excalidraw.md",
    });
  });
});
