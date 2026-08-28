import { describe, expect, it } from "vitest";
import { mergeSettings } from "./Settings";

describe("mergeSettings", () => {
  it("drops the former search permission and defaults delete to deny", () => {
    const merged = mergeSettings({
      maxEditableNotes: 8,
      permissions: {
        read: "ask",
        search: "deny",
        create: "allow",
        edit: "ask",
      },
    });
    expect(merged.permissions).toEqual({
      read: "ask",
      edit: "ask",
      create: "allow",
      delete: "deny",
      webSearch: "deny",
    });
    expect("maxEditableNotes" in merged).toBe(false);
  });

  it("defaults webSearch to deny and keeps an explicit value", () => {
    expect(mergeSettings({}).permissions.webSearch).toBe("deny");
    expect(mergeSettings({ permissions: { webSearch: "allow" } }).permissions.webSearch).toBe("allow");
  });

  it("drops the former selection context setting", () => {
    const merged = mergeSettings({
      includeSelectionContext: true,
    });
    expect("includeSelectionContext" in merged).toBe(false);
  });

  it("defaults session files to json.md and keeps json when set", () => {
    expect(mergeSettings({}).sessionFileFormat).toBe("json.md");
    expect(mergeSettings({ sessionFileFormat: "json" }).sessionFileFormat).toBe("json");
    expect(mergeSettings({ sessionFileFormat: "nope" } as Record<string, unknown>).sessionFileFormat).toBe("json.md");
  });

  it("defaults the plugin directory to pidian and keeps a valid custom folder", () => {
    expect(mergeSettings({}).pluginDirectory).toBe("pidian");
    expect(mergeSettings({ pluginDirectory: "agent-data" }).pluginDirectory).toBe("agent-data");
    expect(mergeSettings({ pluginDirectory: "../secret" }).pluginDirectory).toBe("pidian");
    expect(mergeSettings({ pluginDirectory: ".obsidian" }).pluginDirectory).toBe("pidian");
  });

  it("builds a fresh copy so a settings reset does not mutate defaults", () => {
    const restored = mergeSettings({});
    restored.apiKeys.openai = "mutated";
    restored.permissions.read = "deny";
    restored.customProviders.push({
      id: "custom-2",
      name: "Other",
      baseUrl: "http://localhost",
      modelId: "",
      apiKey: "",
    });
    expect(mergeSettings({}).apiKeys).toEqual({});
    expect(mergeSettings({}).permissions.read).toBe("allow");
    expect(mergeSettings({}).customProviders).toEqual([]);
  });
});
