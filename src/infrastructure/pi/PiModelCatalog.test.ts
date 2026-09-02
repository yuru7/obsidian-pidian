import { describe, expect, it } from "vitest";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { CredentialResolver } from "../../application/CredentialResolver";
import { DEFAULT_SETTINGS, type CustomOpenAIProvider } from "../../settings/Settings";
import { createCredentialResolver } from "./PiCredentials";
import { PiModelCatalog } from "./PiModelCatalog";

function customModel(
  modelId: string,
  extras: Partial<{ id: string; name: string; extraRequestBody: string; supportsImages: boolean }> = {},
): CustomOpenAIProvider["models"][number] {
  return {
    id: extras.id ?? modelId,
    name: extras.name ?? modelId,
    modelId,
    extraRequestBody: extras.extraRequestBody ?? "",
    supportsImages: extras.supportsImages,
  };
}

function customProvider(
  id: string,
  name: string,
  modelIds: string[],
  extras: Partial<CustomOpenAIProvider> = {},
): CustomOpenAIProvider {
  return {
    id,
    name,
    baseUrl: "http://localhost:11434/v1",
    models: modelIds.map((modelId) => customModel(modelId)),
    apiKey: "",
    ...extras,
  };
}

function catalog(options: {
  providerIds?: string[];
  models?: Array<{
    id: string;
    name?: string;
    provider: string;
    reasoning?: boolean;
    thinkingLevelMap?: Record<string, string | null>;
    input?: string[];
  }>;
  custom?: CustomOpenAIProvider[];
  credentials: CredentialResolver;
}): PiModelCatalog {
  const runtime = {
    getProviders: () =>
      (options.providerIds ?? ["openai", "anthropic"]).map((id) => ({
        id,
        name: id,
      })),
    getModels: () => options.models ?? [],
  } as unknown as ModelRuntime;
  return new PiModelCatalog(
    async () => runtime,
    () => options.custom ?? [],
    options.credentials,
  );
}

describe("PiModelCatalog.listProviders", () => {
  it("lists only providers with a settings API key", async () => {
    const listed = await catalog({
      credentials: new CredentialResolver({
        getSetting: (id) => (id === "openai" ? "sk-test" : undefined),
        getEnv: () => undefined,
      }),
    }).listProviders();
    expect(listed.map((provider) => provider.id)).toEqual(["openai"]);
  });

  it("lists providers configured by environment variable", async () => {
    const listed = await catalog({
      credentials: new CredentialResolver({
        getSetting: () => undefined,
        getEnv: (id) => (id === "anthropic" ? "env-key" : undefined),
      }),
    }).listProviders();
    expect(listed.map((provider) => provider.id)).toEqual(["anthropic"]);
  });

  it("omits providers with neither settings nor env credentials", async () => {
    const listed = await catalog({
      credentials: new CredentialResolver({
        getSetting: () => undefined,
        getEnv: () => undefined,
      }),
    }).listProviders();
    expect(listed).toEqual([]);
  });

  it("includes a configured custom provider even without an API key", async () => {
    const custom: CustomOpenAIProvider[] = [
      customProvider("ollama", "Ollama", ["llama"]),
      customProvider("incomplete", "Incomplete", [""], {
        baseUrl: "http://localhost:1234/v1",
        apiKey: "x",
      }),
    ];
    const listed = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listProviders();
    expect(listed.map((provider) => provider.id)).toEqual(["ollama"]);
  });

  it("includes a custom provider whose key is stored only on the provider entry", async () => {
    const custom: CustomOpenAIProvider[] = [customProvider("custom-1", "Local", ["llama"], { apiKey: "local-key" })];
    const listed = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listProviders();
    expect(listed.map((provider) => provider.id)).toEqual(["custom-1"]);
  });

  it("uses the settings name when the runtime already registered the custom provider", async () => {
    const custom: CustomOpenAIProvider[] = [customProvider("custom-1", "XXXカスタム", ["bbb aaaaa"])];
    const listed = await catalog({
      providerIds: ["custom-1"],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listProviders();
    expect(listed).toEqual([
      {
        id: "custom-1",
        name: "XXXカスタム",
        envVarNames: [],
        isCustom: true,
      },
    ]);
  });
});

describe("PiModelCatalog.listModels", () => {
  it("returns the configured custom model id", async () => {
    const custom: CustomOpenAIProvider[] = [customProvider("ollama", "Ollama", ["llama"])];
    const models = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listModels("ollama");
    expect(models).toEqual([{ id: "llama", name: "llama", providerId: "ollama", thinkingLevels: [], supportsImages: false }]);
  });

  it("returns every configured custom model id", async () => {
    const custom: CustomOpenAIProvider[] = [customProvider("ollama", "Ollama", ["llama", "mistral", "llama"])];
    const models = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listModels("ollama");
    expect(models).toEqual([
      { id: "llama", name: "llama", providerId: "ollama", thinkingLevels: [], supportsImages: false },
      { id: "mistral", name: "mistral", providerId: "ollama", thinkingLevels: [], supportsImages: false },
    ]);
  });

  it("sorts custom model ids by name", async () => {
    const custom: CustomOpenAIProvider[] = [customProvider("ollama", "Ollama", ["mistral", "llama"])];
    const models = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listModels("ollama");
    expect(models.map((model) => model.id)).toEqual(["llama", "mistral"]);
  });

  it("uses the model setting name and keeps duplicate API model ids as separate entries", async () => {
    const custom: CustomOpenAIProvider[] = [
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        models: [
          customModel("foo", { id: "foo-high", name: "foo high" }),
          customModel("foo", { id: "foo-medium", name: "foo medium" }),
        ],
        apiKey: "",
      },
    ];
    const models = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listModels("ollama");
    expect(models).toEqual([
      { id: "foo-high", name: "foo high", providerId: "ollama", thinkingLevels: [], supportsImages: false },
      { id: "foo-medium", name: "foo medium", providerId: "ollama", thinkingLevels: [], supportsImages: false },
    ]);
  });

  it("sorts runtime models by name including dynamic entries", async () => {
    const models = await catalog({
      models: [
        { id: "gpt-x", name: "Zeta", provider: "openai" },
        { id: "gpt-4.1", name: "Alpha", provider: "openai" },
        { id: "gpt-4o", name: "Mu", provider: "openai" },
      ],
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        apiKeys: { openai: "sk-test" },
      })),
    }).listModels("openai");
    expect(models.map((model) => model.name)).toEqual(["Alpha", "Mu", "Zeta"]);
    expect(models.map((model) => model.thinkingLevels)).toEqual([["off"], ["off"], ["off"]]);
  });

  it("exposes catalog thinking levels for reasoning models", async () => {
    const models = await catalog({
      models: [
        {
          id: "gpt-5",
          name: "GPT-5",
          provider: "openai",
          reasoning: true,
          thinkingLevelMap: { off: null, xhigh: "xhigh" },
        },
      ],
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        apiKeys: { openai: "sk-test" },
      })),
    }).listModels("openai");
    expect(models[0]?.thinkingLevels).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  });

  it("exposes vision support from a custom model flag", async () => {
    const custom: CustomOpenAIProvider[] = [
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        models: [
          customModel("llama"),
          customModel("llava", { supportsImages: true }),
        ],
        apiKey: "",
      },
    ];
    const models = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        customProviders: custom,
      })),
    }).listModels("ollama");
    expect(models.map((model) => [model.id, model.supportsImages])).toEqual([
      ["llama", false],
      ["llava", true],
    ]);
  });

  it("exposes vision support from runtime model input", async () => {
    const models = await catalog({
      models: [
        { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", input: ["text"] },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai", input: ["text", "image"] },
      ],
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        apiKeys: { openai: "sk-test" },
      })),
    }).listModels("openai");
    expect(models.find((model) => model.id === "gpt-4.1")?.supportsImages).toBe(false);
    expect(models.find((model) => model.id === "gpt-4o")?.supportsImages).toBe(true);
  });
});
