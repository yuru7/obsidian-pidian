import { describe, expect, it } from "vitest";
import { bindConfigDir } from "../application/notePath";
import {
  fillModelSettingNameFromId,
  isDuplicateCustomProviderName,
  isDuplicateModelSettingName,
  mergeSettings,
  uniqueCustomProviderName,
  type CustomProviderModel,
} from "./Settings";

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

  it("defaults session auto-delete and the count limit to off", () => {
    expect(mergeSettings({}).autoDeleteSessions).toBe(false);
    expect(mergeSettings({ autoDeleteSessions: true }).autoDeleteSessions).toBe(true);
    expect(mergeSettings({ autoDeleteSessions: false }).autoDeleteSessions).toBe(false);
    expect(mergeSettings({ autoDeleteSessions: "yes" } as Record<string, unknown>).autoDeleteSessions).toBe(false);
    expect(mergeSettings({}).limitSessionCount).toBe(false);
    expect(mergeSettings({}).maxSessionCount).toBe(5000);
    expect(mergeSettings({ limitSessionCount: true, maxSessionCount: 100 }).limitSessionCount).toBe(true);
    expect(mergeSettings({ limitSessionCount: true, maxSessionCount: 100 }).maxSessionCount).toBe(100);
    expect(mergeSettings({ limitSessionCount: "yes" } as Record<string, unknown>).limitSessionCount).toBe(false);
    expect(mergeSettings({ maxSessionCount: 0 }).maxSessionCount).toBe(5000);
    expect(mergeSettings({ maxSessionCount: -1 }).maxSessionCount).toBe(5000);
  });

  it("defaults sendWithCtrlEnter to false and keeps true", () => {
    expect(mergeSettings({}).sendWithCtrlEnter).toBe(false);
    expect(mergeSettings({ sendWithCtrlEnter: true }).sendWithCtrlEnter).toBe(true);
    expect(mergeSettings({ sendWithCtrlEnter: false }).sendWithCtrlEnter).toBe(false);
    expect(mergeSettings({ sendWithCtrlEnter: "yes" } as Record<string, unknown>).sendWithCtrlEnter).toBe(false);
  });

  it("defaults firecrawlApiKey to empty and keeps an explicit value", () => {
    expect(mergeSettings({}).firecrawlApiKey).toBe("");
    expect(mergeSettings({ firecrawlApiKey: "fc-test" }).firecrawlApiKey).toBe("fc-test");
    expect(mergeSettings({ firecrawlApiKey: 1 } as Record<string, unknown>).firecrawlApiKey).toBe("");
  });

  it("keeps valid OAuth credentials and drops invalid ones", () => {
    expect(mergeSettings({}).oauthCredentials).toEqual({});
    expect(
      mergeSettings({
        oauthCredentials: {
          "openai-codex": {
            type: "oauth",
            access: "access",
            refresh: "refresh",
            expires: 1700000000000,
            accountId: "acct",
          },
          broken: { type: "oauth", access: "x" },
          key: { type: "api_key", key: "sk" },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        oauthCredentials: {
          "openai-codex": {
            type: "oauth",
            access: "access",
            refresh: "refresh",
            expires: 1700000000000,
            accountId: "acct",
          },
        },
      }),
    );
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

  it("defaults session files to jsonl.md and keeps jsonl when set", () => {
    expect(mergeSettings({}).sessionFileFormat).toBe("jsonl.md");
    expect(mergeSettings({ sessionFileFormat: "jsonl.md" }).sessionFileFormat).toBe("jsonl.md");
    expect(mergeSettings({ sessionFileFormat: "json.md" }).sessionFileFormat).toBe("jsonl.md");
    expect(mergeSettings({ sessionFileFormat: "jsonl" }).sessionFileFormat).toBe("jsonl");
    expect(mergeSettings({ sessionFileFormat: "json" }).sessionFileFormat).toBe("jsonl");
    expect(mergeSettings({ sessionFileFormat: "nope" } as Record<string, unknown>).sessionFileFormat).toBe("jsonl.md");
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
    restored.oauthCredentials["openai-codex"] = {
      type: "oauth",
      access: "a",
      refresh: "r",
      expires: 1,
    };
    restored.permissions.read = "deny";
    restored.customProviders.push({
      id: "custom-2",
      name: "Other",
      baseUrl: "http://localhost",
      models: [{ id: "", name: "", modelId: "", extraRequestBody: "" }],
      apiKey: "",
    });
    restored.modelFavorites.push({ id: "fav-1", provider: "openai", model: "gpt-5" });
    expect(mergeSettings({}).apiKeys).toEqual({});
    expect(mergeSettings({}).oauthCredentials).toEqual({});
    expect(mergeSettings({}).permissions.read).toBe("allow");
    expect(mergeSettings({}).customProviders).toEqual([]);
    expect(mergeSettings({}).modelFavorites).toEqual([]);
  });

  it("migrates a custom provider modelId into models", () => {
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
            models: [{ id: "llama", name: "llama", modelId: "llama", extraRequestBody: "", supportsImages: false }],
            apiKey: "",
          },
        ],
      }),
    );
  });

  it("migrates custom provider modelIds into models", () => {
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
      }).customProviders[0]?.models,
    ).toEqual([
      { id: "llama", name: "llama", modelId: "llama", extraRequestBody: "", supportsImages: false },
      { id: "mistral", name: "mistral", modelId: "mistral", extraRequestBody: "", supportsImages: false },
    ]);
  });

  it("keeps custom provider models when already present", () => {
    expect(
      mergeSettings({
        customProviders: [
          {
            id: "custom-1",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
            models: [
              {
                id: "foo-high",
                name: "foo high",
                modelId: "foo",
                extraRequestBody: '{"reasoning_effort":"high"}',
              },
            ],
            apiKey: "",
          },
        ],
      }).customProviders[0]?.models,
    ).toEqual([
      {
        id: "foo-high",
        name: "foo high",
        modelId: "foo",
        extraRequestBody: '{"reasoning_effort":"high"}',
        supportsImages: false,
      },
    ]);
  });

  it("keeps a custom model vision flag", () => {
    expect(
      mergeSettings({
        customProviders: [
          {
            id: "custom-1",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
            models: [
              {
                id: "vl",
                name: "vl",
                modelId: "qwen-vl",
                extraRequestBody: "",
                supportsImages: true,
              },
            ],
            apiKey: "",
          },
        ],
      }).customProviders[0]?.models,
    ).toEqual([
      {
        id: "vl",
        name: "vl",
        modelId: "qwen-vl",
        extraRequestBody: "",
        supportsImages: true,
      },
    ]);
  });
});

describe("isDuplicateModelSettingName", () => {
  const models = (names: string[]): CustomProviderModel[] =>
    names.map((name, index) => ({
      id: `id-${index}`,
      name,
      modelId: "foo",
      extraRequestBody: "",
    }));

  it("treats the same trimmed name in one provider as a duplicate", () => {
    expect(isDuplicateModelSettingName(models(["foo high", "foo high"]), 0)).toBe(true);
    expect(isDuplicateModelSettingName(models(["foo high", " foo high "]), 1)).toBe(true);
  });

  it("allows the same name in different casing or when empty", () => {
    expect(isDuplicateModelSettingName(models(["foo", "Foo"]), 0)).toBe(false);
    expect(isDuplicateModelSettingName(models(["", ""]), 0)).toBe(false);
  });
});

describe("isDuplicateCustomProviderName", () => {
  const custom = [
    { id: "custom-1", name: "Ollama", baseUrl: "", models: [], apiKey: "" },
    { id: "custom-2", name: "Local", baseUrl: "", models: [], apiKey: "" },
  ];

  it("rejects built-in provider names and ids", () => {
    expect(isDuplicateCustomProviderName("OpenAI", "custom-1", custom, ["OpenAI", "openai"])).toBe(true);
    expect(isDuplicateCustomProviderName("openai", "custom-1", custom, ["OpenAI", "openai"])).toBe(true);
  });

  it("rejects another custom provider's name", () => {
    expect(isDuplicateCustomProviderName("Local", "custom-1", custom, ["OpenAI"])).toBe(true);
  });

  it("allows a provider to keep its own name", () => {
    expect(isDuplicateCustomProviderName("Ollama", "custom-1", custom, ["OpenAI"])).toBe(false);
  });
});

describe("uniqueCustomProviderName", () => {
  it("appends a suffix when the base name is taken", () => {
    expect(uniqueCustomProviderName("Custom", [], ["Custom"])).toBe("Custom 2");
    expect(
      uniqueCustomProviderName("Custom", [{ id: "c", name: "Custom 2", baseUrl: "", models: [], apiKey: "" }], ["Custom"]),
    ).toBe("Custom 3");
  });
});

describe("fillModelSettingNameFromId", () => {
  it("fills an empty name and keeps syncing while the name still matches the previous id", () => {
    const model: CustomProviderModel = { id: "1", name: "", modelId: "", extraRequestBody: "" };
    expect(fillModelSettingNameFromId(model, "", "foo")).toBe(true);
    expect(model.name).toBe("foo");
    expect(fillModelSettingNameFromId(model, "foo", "foo-high")).toBe(true);
    expect(model.name).toBe("foo-high");
  });

  it("does not overwrite a name the user already set", () => {
    const model: CustomProviderModel = { id: "1", name: "foo high", modelId: "foo", extraRequestBody: "" };
    expect(fillModelSettingNameFromId(model, "foo", "foo-bar")).toBe(false);
    expect(model.name).toBe("foo high");
  });
});
