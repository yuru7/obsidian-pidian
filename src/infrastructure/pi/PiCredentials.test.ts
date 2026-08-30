import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../settings/Settings";
import {
  createCredentialResolver,
  envApiKeyForProvider,
  listKnownCredentialProviders,
  PIDIAN_SYSTEM_PROMPT,
} from "./PiCredentials";

const ORIGINAL_OPENCODE_KEY = process.env.OPENCODE_API_KEY;

afterEach(() => {
  if (ORIGINAL_OPENCODE_KEY === undefined) {
    delete process.env.OPENCODE_API_KEY;
  } else {
    process.env.OPENCODE_API_KEY = ORIGINAL_OPENCODE_KEY;
  }
});

describe("OpenCode credentials", () => {
  it("lists Zen and Go as separate credential options", () => {
    const providers = listKnownCredentialProviders();
    expect(providers).toEqual(
      expect.arrayContaining([
        { id: "opencode", name: "OpenCode Zen", envVarNames: ["OPENCODE_API_KEY"] },
        { id: "opencode-go", name: "OpenCode Go", envVarNames: ["OPENCODE_API_KEY"] },
      ]),
    );
  });

  it("reads the same environment variable for Zen and Go", () => {
    process.env.OPENCODE_API_KEY = "shared-key";
    expect(envApiKeyForProvider("opencode")).toBe("shared-key");
    expect(envApiKeyForProvider("opencode-go")).toBe("shared-key");
  });

  it("keeps per-provider settings keys independent", () => {
    const resolver = createCredentialResolver(() => ({
      ...DEFAULT_SETTINGS,
      apiKeys: {
        opencode: "zen-key",
        "opencode-go": "go-key",
      },
    }));
    expect(resolver.resolve("opencode")).toEqual({ source: "settings", apiKey: "zen-key" });
    expect(resolver.resolve("opencode-go")).toEqual({ source: "settings", apiKey: "go-key" });
  });

  it("falls back to the shared env key only when that provider's setting is empty", () => {
    process.env.OPENCODE_API_KEY = "shared-key";
    const resolver = createCredentialResolver(() => ({
      ...DEFAULT_SETTINGS,
      apiKeys: { opencode: "zen-key" },
    }));
    expect(resolver.resolve("opencode")).toEqual({ source: "settings", apiKey: "zen-key" });
    expect(resolver.resolve("opencode-go")).toEqual({ source: "env", apiKey: "shared-key" });
  });

  it("reads a custom provider API key from the provider entry", () => {
    const resolver = createCredentialResolver(() => ({
      ...DEFAULT_SETTINGS,
      customProviders: [
        {
          id: "custom-1",
          name: "Local",
          baseUrl: "http://localhost:11434/v1",
          models: [{ id: "llama", name: "llama", modelId: "llama", extraRequestBody: "" }],
          apiKey: "local-key",
        },
      ],
    }));
    expect(resolver.resolve("custom-1")).toEqual({ source: "settings", apiKey: "local-key" });
  });
});

describe("PIDIAN_SYSTEM_PROMPT", () => {
  it("forbids write tools unless the user clearly asked to change a note", () => {
    expect(PIDIAN_SYSTEM_PROMPT).toContain(
      "Do not call create_note, edit_note, or delete_note unless the user clearly asked",
    );
    expect(PIDIAN_SYSTEM_PROMPT).toContain("Do not use those tools to try them, experiment");
    expect(PIDIAN_SYSTEM_PROMPT).toContain("If it is unclear whether the user wants a vault change, ask first");
  });
});
