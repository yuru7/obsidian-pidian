import { describe, expect, it } from "vitest";
import { assertSafeDirectoryPath, assertSafeNotePath, isExcludedFromSearch } from "./notePath";

describe("notePath", () => {
  it("rejects unsafe paths", () => {
    expect(() => assertSafeNotePath("../secret.md")).toThrow();
    expect(() => assertSafeNotePath(".obsidian/app.json")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.json")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.json.md")).toThrow();
  });

  it("excludes session files and AGENTS.md from search", () => {
    expect(isExcludedFromSearch("pidian/sessions/a.json")).toBe(true);
    expect(isExcludedFromSearch("pidian/sessions/a.json.md")).toBe(true);
    expect(isExcludedFromSearch("pidian/AGENTS.md")).toBe(true);
    expect(isExcludedFromSearch("notes/hello.md")).toBe(false);
  });

  it("treats empty path and slash as the vault root for listing", () => {
    expect(assertSafeDirectoryPath("")).toBe("");
    expect(assertSafeDirectoryPath("/")).toBe("");
    expect(assertSafeDirectoryPath("notes/")).toBe("notes");
    expect(() => assertSafeDirectoryPath(".obsidian")).toThrow();
    expect(() => assertSafeDirectoryPath("pidian/sessions")).toThrow();
  });
});
