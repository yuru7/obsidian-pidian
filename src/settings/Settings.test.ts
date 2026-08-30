import { describe, expect, it } from "vitest";
import { bindConfigDir } from "../application/notePath";
import { mergeSettings } from "./Settings";

const TEST_CONFIG_DIR = "vault-config";

bindConfigDir(() => TEST_CONFIG_DIR);

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

  it("defaults edit to ask and keeps an explicit value", () => {
    expect(mergeSettings({}).permissions.edit).toBe("ask");
    expect(mergeSettings({ permissions: { edit: "allow" } }).permissions.edit).toBe("allow");
    expect(mergeSettings({ permissions: { edit: "deny" } }).permissions.edit).toBe("deny");
  });

  it("drops the former selection context setting", () => {
    const merged = mergeSettings({
      includeSelectionContext: true,
    });
    expect("includeSelectionContext" in merged).toBe(false);
  });

  it("defaults thinking level to medium and keeps a known value", () => {
    expect(mergeSettings({}).thinkingLevel).toBe("medium");
    expect(mergeSettings({ thinkingLevel: "high" }).thinkingLevel).toBe("high");
    expect(mergeSettings({ thinkingLevel: "nope" } as Record<string, unknown>).thinkingLevel).toBe("medium");
  });

  it("defaults favorites to empty and keeps a valid list", () => {
    expect(mergeSettings({}).modelFavorites).toEqual([]);
    expect(
      mergeSettings({
        modelFavorites: [
          { id: "fav-1", provider: "openai", model: "gpt-5", thinkingLevel: "high" },
          { provider: "", model: "gone" },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        modelFavorites: [{ id: "fav-1", provider: "openai", model: "gpt-5", thinkingLevel: "high" }],
      }),
    );
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
    expect(mergeSettings({ pluginDirectory: TEST_CONFIG_DIR }).pluginDirectory).toBe("pidian");
  });

  it("builds a fresh copy so a settings reset does not mutate defaults", () => {
    const restored = mergeSettings({});
    restored.apiKeys.openai = "mutated";
    restored.permissions.read = "deny";
    restored.customProviders.push({
      id: "custom-2",
      name: "Other",
      baseUrl: "http://localhost",
      modelIds: [""],
      apiKey: "",
    });
    restored.modelFavorites.push({ id: "fav-1", provider: "openai", model: "gpt-5" });
    expect(mergeSettings({}).apiKeys).toEqual({});
    expect(mergeSettings({}).permissions.read).toBe("allow");
    expect(mergeSettings({}).customProviders).toEqual([]);
    expect(mergeSettings({}).modelFavorites).toEqual([]);
  });

  it("migrates a custom provider modelId into modelIds", () => {
    expect(
      mergeSettings({
        customProviders: [
          {
            id: "custom-1",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
            modelId: "llama",
            apiKey: "",
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        customProviders: [
          {
            id: "custom-1",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
            modelIds: ["llama"],
            apiKey: "",
          },
        ],
      }),
    );
  });

  it("keeps custom provider modelIds when already present", () => {
    expect(
      mergeSettings({
        customProviders: [
          {
            id: "custom-1",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
            modelIds: ["llama", "mistral"],
            apiKey: "",
          },
        ],
      }).customProviders[0]?.modelIds,
    ).toEqual(["llama", "mistral"]);
  });
});
