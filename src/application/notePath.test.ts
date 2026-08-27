import { describe, expect, it } from "vitest";
import { assertSafeNotePath, isExcludedFromSearch } from "./notePath";

describe("notePath", () => {
  it("rejects unsafe paths", () => {
    expect(() => assertSafeNotePath("../secret.md")).toThrow();
    expect(() => assertSafeNotePath(".obsidian/app.json")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.json")).toThrow();
  });

  it("excludes session files and AGENTS.md from search", () => {
    expect(isExcludedFromSearch("pidian/sessions/a.json")).toBe(true);
    expect(isExcludedFromSearch("pidian/AGENTS.md")).toBe(true);
    expect(isExcludedFromSearch("notes/hello.md")).toBe(false);
  });
});
