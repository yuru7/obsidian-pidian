import { describe, expect, it } from "vitest";
import {
  assertSafeDirectoryPath,
  assertSafeNotePath,
  isExcludedFromSearch,
  parsePluginDirectory,
} from "./notePath";

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

  it("parses the plugin directory and falls back to pidian", () => {
    expect(parsePluginDirectory(undefined)).toBe("pidian");
    expect(parsePluginDirectory("")).toBe("pidian");
    expect(parsePluginDirectory("..")).toBe("pidian");
    expect(parsePluginDirectory(".obsidian")).toBe("pidian");
    expect(parsePluginDirectory(".obsidian/plugins")).toBe("pidian");
    expect(parsePluginDirectory("agent-data")).toBe("agent-data");
    expect(parsePluginDirectory(" AI/pidian/ ")).toBe("AI/pidian");
  });

  it("restricts the configured plugin directory instead of pidian", () => {
    expect(() => assertSafeNotePath("agent-data/sessions/a.json", "agent-data")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.json", "agent-data")).not.toThrow();
    expect(isExcludedFromSearch("agent-data/AGENTS.md", "agent-data")).toBe(true);
    expect(isExcludedFromSearch("pidian/AGENTS.md", "agent-data")).toBe(false);
    expect(() => assertSafeDirectoryPath("agent-data/sessions", "agent-data")).toThrow();
  });
});
