import { describe, expect, it } from "vitest";
import {
  assertSafeDirectoryPath,
  assertSafeNotePath,
  bindConfigDir,
  isExcludedFromSearch,
  parsePluginDirectory,
} from "./notePath";

const TEST_CONFIG_DIR = "vault-config";

bindConfigDir(() => TEST_CONFIG_DIR);

describe("notePath", () => {
  it("rejects unsafe paths", () => {
    expect(() => assertSafeNotePath("../secret.md")).toThrow();
    expect(() => assertSafeNotePath(`${TEST_CONFIG_DIR}/app.json`)).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.json")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.json.md")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.jsonl")).toThrow();
    expect(() => assertSafeNotePath("pidian/sessions/a.jsonl.md")).toThrow();
  });

  it("excludes session files and AGENTS.md from search", () => {
    expect(isExcludedFromSearch("pidian/sessions/a.json")).toBe(true);
    expect(isExcludedFromSearch("pidian/sessions/a.json.md")).toBe(true);
    expect(isExcludedFromSearch("pidian/sessions/a.jsonl")).toBe(true);
    expect(isExcludedFromSearch("pidian/sessions/a.jsonl.md")).toBe(true);
    expect(isExcludedFromSearch("pidian/AGENTS.md")).toBe(true);
    expect(isExcludedFromSearch("notes/hello.md")).toBe(false);
  });

  it("treats empty path and slash as the vault root for listing", () => {
    expect(assertSafeDirectoryPath("")).toBe("");
    expect(assertSafeDirectoryPath("/")).toBe("");
    expect(assertSafeDirectoryPath("notes/")).toBe("notes");
    expect(() => assertSafeDirectoryPath(TEST_CONFIG_DIR)).toThrow();
    expect(() => assertSafeDirectoryPath("pidian/sessions")).toThrow();
  });

  it("parses the plugin directory and falls back to pidian", () => {
    expect(parsePluginDirectory(undefined)).toBe("pidian");
    expect(parsePluginDirectory("")).toBe("pidian");
    expect(parsePluginDirectory("..")).toBe("pidian");
    expect(parsePluginDirectory(TEST_CONFIG_DIR)).toBe("pidian");
    expect(parsePluginDirectory(`${TEST_CONFIG_DIR}/plugins`)).toBe("pidian");
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

  it("restricts the bound vault config folder instead of a hardcoded name", () => {
    expect(() => assertSafeNotePath(`${TEST_CONFIG_DIR}/workspace.json`)).toThrow(
      `Notes inside ${TEST_CONFIG_DIR}/ cannot be accessed.`,
    );
    expect(() => assertSafeNotePath("notes/hello.md")).not.toThrow();
    bindConfigDir(() => "other-config");
    try {
      expect(() => assertSafeNotePath("other-config/app.json")).toThrow();
      expect(() => assertSafeNotePath(`${TEST_CONFIG_DIR}/app.json`)).not.toThrow();
    } finally {
      bindConfigDir(() => TEST_CONFIG_DIR);
    }
  });
});
