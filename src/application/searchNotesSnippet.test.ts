import { describe, expect, it } from "vitest";
import { snippetAround, snippetForQuery } from "./searchNotesSnippet";

describe("searchNotesSnippet", () => {
  it("keeps a window around the match and collapses whitespace", () => {
    const content = "aaa\nhello   world\nbbb";
    expect(snippetAround(content, 4, 5, 2)).toBe("…a hello …");
  });

  it("finds the query case-insensitively", () => {
    expect(snippetForQuery("alpha Hello omega", "HELLO")).toBe("alpha Hello omega");
  });

  it("returns undefined when the query is not a substring", () => {
    expect(snippetForQuery("alpha omega", "missing")).toBeUndefined();
  });
});
