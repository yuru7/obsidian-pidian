import { describe, expect, it, vi } from "vitest";
import { collectSearchHits } from "./searchIndexedNotes";

describe("collectSearchHits", () => {
  it("returns exact filename hits first without reading those note bodies", async () => {
    const readContent = vi.fn(async (path: string) =>
      path === "notes/Other.md" ? "mentions Note in the body" : "hello body",
    );
    const hits = await collectSearchHits({
      query: "Note",
      paths: ["notes/Note.md", "notes/Other.md"],
      ranked: [{ path: "notes/Other.md", title: "Other", score: 9, matchedContent: true }],
      readContent,
    });

    expect(hits[0]).toEqual({ path: "notes/Note.md", matchType: "filename", snippet: "notes/Note.md" });
    expect(hits[1]).toEqual({
      path: "notes/Other.md",
      matchType: "content",
      snippet: "mentions Note in the body",
    });
    expect(readContent).toHaveBeenCalledTimes(1);
    expect(readContent).toHaveBeenCalledWith("notes/Other.md");
  });

  it("fills remaining slots from ranked hits and reads only the snippet window", async () => {
    const readContent = vi.fn(async (path: string) => `body of ${path} includes unique-token`);
    const hits = await collectSearchHits({
      query: "unique-token",
      paths: ["a.md", "b.md", "c.md"],
      ranked: [
        { path: "a.md", title: "a", score: 3, matchedContent: true },
        { path: "b.md", title: "b", score: 2, matchedContent: true },
        { path: "c.md", title: "c", score: 1, matchedContent: true },
      ],
      readContent,
      snippetLimit: 1,
    });

    expect(hits.map((hit) => hit.path)).toEqual(["a.md", "b.md", "c.md"]);
    expect(hits[0]?.matchType).toBe("content");
    expect(hits[0]?.snippet).toContain("unique-token");
    expect(hits[1]?.snippet).toBe("b");
    expect(readContent).toHaveBeenCalledTimes(1);
    expect(readContent).toHaveBeenCalledWith("a.md");
  });

  it("treats a title-only ranked hit as a filename match and does not read the body", async () => {
    const readContent = vi.fn(async () => "朝、目を覚ますとカーテンの隙間から光が差し込んでいた。");
    const hits = await collectSearchHits({
      query: "ほげほげ",
      paths: ["ほげほげ.md", "ほげほげ2.md"],
      ranked: [{ path: "ほげほげ2.md", title: "ほげほげ2", score: 9, matchedContent: false }],
      readContent,
    });

    expect(hits).toEqual([
      { path: "ほげほげ.md", matchType: "filename", snippet: "ほげほげ.md" },
      { path: "ほげほげ2.md", matchType: "filename", snippet: "ほげほげ2.md" },
    ]);
    expect(readContent).not.toHaveBeenCalled();
  });
});
