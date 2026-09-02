import { describe, expect, it } from "vitest";
import type { CustomOpenAIProvider } from "../settings/Settings";
import { connectionConfigFingerprint, reconcileModelSelection } from "./modelSelection";

const known = new Set(["openai", "anthropic"]);

const ollama: CustomOpenAIProvider = {
  id: "custom-1",
  name: "Ollama",
  baseUrl: "http://localhost:11434/v1",
  models: [{ id: "llama", name: "llama", modelId: "llama", extraRequestBody: "" }],
  apiKey: "",
};

function withModels(...modelIds: string[]): CustomOpenAIProvider {
  return {
    ...ollama,
    models: modelIds.map((modelId) => ({ id: modelId, name: modelId, modelId, extraRequestBody: "" })),
  };
}

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
        [withModels("llama", "mistral")],
        known,
      ),
    ).toEqual({ provider: "custom-1", model: "mistral" });
  });

  it("falls back to the first custom model when the selected one is gone", () => {
    expect(
      reconcileModelSelection({ provider: "custom-1", model: "old" }, [withModels("llama3")], known),
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
      reconcileModelSelection({ provider: "custom-1", model: "llama" }, [withModels("")], known),
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
      connectionConfigFingerprint({ ...base, customProviders: [withModels("other")] }),
    );
    expect(connectionConfigFingerprint(base)).not.toBe(
      connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama, apiKey: "k" }] }),
    );
    expect(connectionConfigFingerprint(base)).not.toBe(connectionConfigFingerprint({ ...base, apiKeys: { openai: "sk" } }));
  });

  it("changes when a custom model vision flag changes", () => {
    const base = { apiKeys: {}, customProviders: [ollama] };
    const withVision = {
      ...ollama,
      models: ollama.models.map((model) => ({ ...model, supportsImages: true })),
    };
    expect(connectionConfigFingerprint(base)).not.toBe(
      connectionConfigFingerprint({ ...base, customProviders: [withVision] }),
    );
  });

  it("ignores display name changes", () => {
    const base = { apiKeys: {}, customProviders: [ollama] };
    expect(connectionConfigFingerprint(base)).toBe(
      connectionConfigFingerprint({ ...base, customProviders: [{ ...ollama, name: "XXX" }] }),
    );
  });

  it("ignores custom model setting names, API model ids, and extra JSON", () => {
    const base = { apiKeys: {}, customProviders: [ollama] };
    const renamed = {
      ...ollama,
      models: ollama.models.map((model) => ({
        ...model,
        name: "foo high",
        modelId: "other-api",
        extraRequestBody: '{"reasoning_effort":"high"}',
      })),
    };
    expect(connectionConfigFingerprint(base)).toBe(
      connectionConfigFingerprint({ ...base, customProviders: [renamed] }),
    );
  });
});
