import { describe, expect, it } from "vitest";
import { matchesNameGlob, NAME_GLOB_RULE, parseOptionalNameGlob } from "./nameGlob";

describe("parseOptionalNameGlob", () => {
  it("treats omitted or blank glob as no filter", () => {
    expect(parseOptionalNameGlob(undefined)).toBeUndefined();
    expect(parseOptionalNameGlob("")).toBeUndefined();
    expect(parseOptionalNameGlob("  ")).toBeUndefined();
  });

  it("trims a name glob", () => {
    expect(parseOptionalNameGlob("  *.json  ")).toBe("*.json");
  });

  it("rejects non-strings, paths, recursion, and parent segments", () => {
    expect(() => parseOptionalNameGlob(1)).toThrow("glob must be a string.");
    expect(() => parseOptionalNameGlob("**/*.json")).toThrow(NAME_GLOB_RULE);
    expect(() => parseOptionalNameGlob("notes/*.json")).toThrow(NAME_GLOB_RULE);
    expect(() => parseOptionalNameGlob("notes\\*.json")).toThrow(NAME_GLOB_RULE);
    expect(() => parseOptionalNameGlob("..")).toThrow(NAME_GLOB_RULE);
    expect(() => parseOptionalNameGlob("foo**bar")).toThrow(NAME_GLOB_RULE);
  });
});

describe("matchesNameGlob", () => {
  it("matches *.json against the whole name, ignoring case", () => {
    expect(matchesNameGlob("data.json", "*.json")).toBe(true);
    expect(matchesNameGlob("DATA.JSON", "*.json")).toBe(true);
    expect(matchesNameGlob("data.json.bak", "*.json")).toBe(false);
    expect(matchesNameGlob("data.jsonl", "*.json")).toBe(false);
    expect(matchesNameGlob("dataXjson", "*.json")).toBe(false);
    expect(matchesNameGlob("notes", "*.json")).toBe(false);
  });

  it("treats other glob metacharacters as literals", () => {
    expect(matchesNameGlob("a.json", "?.json")).toBe(false);
    expect(matchesNameGlob("?.json", "?.json")).toBe(true);
    expect(matchesNameGlob("file.json", "file.json")).toBe(true);
  });

  it("lets * match any substring, including empty", () => {
    expect(matchesNameGlob("2026-09-02.md", "2026-*.md")).toBe(true);
    expect(matchesNameGlob("note", "*")).toBe(true);
    expect(matchesNameGlob("note.md", "note.*")).toBe(true);
    expect(matchesNameGlob("note", "note.*")).toBe(false);
  });
});
