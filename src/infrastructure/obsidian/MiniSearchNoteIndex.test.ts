import { describe, expect, it } from "vitest";
import { MiniSearchNoteIndex } from "./MiniSearchNoteIndex";

describe("MiniSearchNoteIndex", () => {
  it("does not store note bodies in stored fields", async () => {
    const index = MiniSearchNoteIndex.empty();
    const secret = "unique-body-phrase-not-for-storage";
    index.upsert({
      id: "a.md",
      path: "a.md",
      title: "Alpha",
      content: `intro ${secret} outro`,
    });

    expect(index.storedFields("a.md")).toEqual({ path: "a.md", title: "Alpha" });
    expect(index.search(secret, 10)).toEqual([
      { path: "a.md", title: "Alpha", score: expect.any(Number), matchedContent: true },
    ]);
  });

  it("replaces, discards, and searches after a JSON round-trip", async () => {
    const index = MiniSearchNoteIndex.empty();
    index.upsert({ id: "a.md", path: "a.md", title: "Alpha", content: "cats and dogs" });
    index.upsert({ id: "b.md", path: "b.md", title: "Beta", content: "only cats" });
    index.upsert({ id: "a.md", path: "a.md", title: "Alpha", content: "only dogs" });
    index.remove("b.md");

    const loaded = await MiniSearchNoteIndex.fromJSON(index.toJSON());
    expect(loaded).toBeDefined();
    expect(loaded?.search("dogs", 10).map((hit) => hit.path)).toEqual(["a.md"]);
    expect(loaded?.search("cats", 10)).toEqual([]);
  });

  it("matches Japanese content through CJK bigrams", () => {
    const index = MiniSearchNoteIndex.empty();
    index.upsert({
      id: "tokyo.md",
      path: "tokyo.md",
      title: "旅行",
      content: "東京タワーに行った",
    });

    expect(index.search("東京タワー", 10).map((hit) => hit.path)).toEqual(["tokyo.md"]);
  });

  it("does not treat a title-only Japanese match as content", () => {
    const index = MiniSearchNoteIndex.empty();
    index.upsert({
      id: "ほげほげ2.md",
      path: "ほげほげ2.md",
      title: "ほげほげ2",
      content: "朝、目を覚ますとカーテンの隙間から柔らかな光が差し込んでいた。",
    });

    expect(index.search("ほげほげ", 10)).toEqual([
      {
        path: "ほげほげ2.md",
        title: "ほげほげ2",
        score: expect.any(Number),
        matchedContent: false,
      },
    ]);
  });
});
