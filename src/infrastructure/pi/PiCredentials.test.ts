import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../settings/Settings";
import {
  createCredentialResolver,
  envApiKeyForProvider,
  listKnownCredentialProviders,
  pidianSystemPrompt,
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

  it("treats a stored OAuth credential as configured", () => {
    const resolver = createCredentialResolver(() => ({
      ...DEFAULT_SETTINGS,
      oauthCredentials: {
        "openai-codex": {
          type: "oauth",
          access: "access",
          refresh: "refresh",
          expires: 1,
        },
      },
    }));
    expect(resolver.resolve("openai-codex")).toEqual({ source: "oauth" });
    expect(resolver.hasCredential("openai-codex")).toBe(true);
  });
});

describe("pidianSystemPrompt", () => {
  it("describes the compact user-turn header without treating it as note contents", () => {
    const prompt = pidianSystemPrompt(false);
    expect(prompt).toContain(
      "Each user turn is an ISO 8601 local timestamp, then optional `PATH LINE_RANGE` or `PATH`, then `User:` and the message",
    );
    expect(prompt).toContain(
      "The header is send time and location only, never file contents, and is not the user's text",
    );
    expect(prompt).toContain("Use the timestamp to resolve relative dates");
    expect(prompt).toContain("prefer a date the user wrote");
    expect(prompt).toContain("LINE_RANGE is the Markdown cursor (`L12`) or a text selection (`L3:C4-L5:C3`)");
    expect(prompt).toContain("beforeContext and afterContext");
    expect(prompt).toContain("Call get_note_metadata when you need Markdown frontmatter, headings, tags, or links without the note body");
    expect(prompt).toContain("get_note_metadata reads a Markdown note's frontmatter");
    expect(prompt).toContain("get_vault_links reads vault-wide resolved and unresolved link maps");
  });

  it("forbids write tools unless the user explicitly asked to change a note", () => {
    const prompt = pidianSystemPrompt(false);
    expect(prompt).toContain(
      "Call create_note, edit_markdown, or delete_note only when the user explicitly asked",
    );
    expect(prompt).toContain("Requests that only ask to produce or show content stay in chat");
    expect(prompt).toContain("出して");
    expect(prompt).toContain(
      "If it is unclear whether they want a vault change or a chat reply, put the result in chat",
    );
    expect(prompt).toContain("Do not use those tools to try them, experiment");
  });

  it("requires clickable markdown links and forbids wiki, quoted, or plain paths", () => {
    const prompt = pidianSystemPrompt(false);
    expect(prompt).toContain("Chat links (required):");
    expect(prompt).toContain("write it as a Markdown link");
    expect(prompt).toContain("[Note.md](folder/Note.md) or [サンプル.md](サンプル.md)");
    expect(prompt).toContain("[Note.md](<folder/My Note.md>)");
    expect(prompt).toContain("Do not write that path as a Wiki link, as plain text, in 「」, or in backticks");
    expect(prompt).toContain("Do not link notes you have not confirmed exist");
    expect(prompt.indexOf("Chat links (required):")).toBeGreaterThan(
      prompt.indexOf("Prefer concise answers in the user's language."),
    );
  });

  it("omits read_image when the model does not support vision", () => {
    const prompt = pidianSystemPrompt(false);
    expect(prompt).not.toContain("read_image");
    expect(prompt).not.toContain("read images");
  });

  it("describes read_image only for vision models", () => {
    const prompt = pidianSystemPrompt(true);
    expect(prompt).toContain("read images");
    expect(prompt).toContain("Call read_image when the path is a PNG, JPEG, or WebP image");
    expect(prompt).toContain("read_image reads PNG, JPEG, and WebP");
  });
});
