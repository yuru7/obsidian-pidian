import { describe, expect, it } from "vitest";
import type { CustomOpenAIProvider } from "../settings/Settings";
import { connectionConfigFingerprint, reconcileModelSelection } from "./modelSelection";

const known = new Set(["openai", "anthropic"]);

const ollama: CustomOpenAIProvider = {
  id: "custom-1",
  name: "Ollama",
  baseUrl: "http://localhost:11434/v1",
  modelIds: ["llama"],
  apiKey: "",
};

describe("reconcileModelSelection", () => {
  it("keeps a known built-in provider and model", () => {
    expect(reconcileModelSelection({ provider: "openai", model: "gpt-5" }, [], known)).toEqual({
      provider: "openai",
      model: "gpt-5",
    });
  });

  it("keeps a selected custom model that is still listed", () => {
    expect(
      reconcileModelSelection(
        { provider: "custom-1", model: "mistral" },
        [{ ...ollama, modelIds: ["llama", "mistral"] }],
        known,
      ),
    ).toEqual({ provider: "custom-1", model: "mistral" });
  });

  it("falls back to the first custom model when the selected one is gone", () => {
    expect(
      reconcileModelSelection({ provider: "custom-1", model: "old" }, [{ ...ollama, modelIds: ["llama3"] }], known),
    ).toEqual({ provider: "custom-1", model: "llama3" });
  });

  it("clears selection when the active custom provider is removed", () => {
    expect(reconcileModelSelection({ provider: "custom-1", model: "llama" }, [], known)).toEqual({
      provider: "",
      model: "",
    });
  });

  it("clears selection when the custom provider is no longer usable", () => {
    expect(
      reconcileModelSelection({ provider: "custom-1", model: "llama" }, [{ ...ollama, modelIds: [""] }], known),
    ).toEqual({ provider: "", model: "" });
  });

  it("keeps an empty selection empty", () => {
    expect(reconcileModelSelection({ provider: "", model: "" }, [ollama], known)).toEqual({
      provider: "",
      model: "",
    });
  });
});

describe("connectionConfigFingerprint", () => {
  it("changes when the endpoint, model id, or API key changes", () => {
    const base = { apiKeys: {}, customProviders: [ollama] };
    expect(connectionConfigFingerprint(base)).toBe(connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama }] }));
    expect(connectionConfigFingerprint(base)).not.toBe(
      connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama, baseUrl: "http://127.0.0.1:11434/v1" }] }),
    );
    expect(connectionConfigFingerprint(base)).not.toBe(
      connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama, modelIds: ["other"] }] }),
    );
    expect(connectionConfigFingerprint(base)).not.toBe(
      connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama, apiKey: "k" }] }),
    );
    expect(connectionConfigFingerprint(base)).not.toBe(connectionConfigFingerprint({ ...base, apiKeys: { openai: "sk" } }));
  });

  it("ignores display name changes", () => {
    const base = { apiKeys: {}, customProviders: [ollama] };
    expect(connectionConfigFingerprint(base)).toBe(
      connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama, name: "XXX" }] }),
    );
  });
});
