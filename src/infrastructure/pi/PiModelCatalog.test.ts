import { describe, expect, it } from "vitest";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { CredentialResolver } from "../../application/CredentialResolver";
import { DEFAULT_SETTINGS, type CustomOpenAIProvider } from "../../settings/Settings";
import { createCredentialResolver } from "./PiCredentials";
import { PiModelCatalog } from "./PiModelCatalog";

function catalog(options: {
  providerIds?: string[];
  models?: Array<{
    id: string;
    name?: string;
    provider: string;
    reasoning?: boolean;
    thinkingLevelMap?: Record<string, string | null>;
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
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        modelIds: ["llama"],
        apiKey: "",
      },
      {
        id: "incomplete",
        name: "Incomplete",
        baseUrl: "http://localhost:1234/v1",
        modelIds: [""],
        apiKey: "x",
      },
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
    const custom: CustomOpenAIProvider[] = [
      {
        id: "custom-1",
        name: "Local",
        baseUrl: "http://localhost:11434/v1",
        modelIds: ["llama"],
        apiKey: "local-key",
      },
    ];
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
    const custom: CustomOpenAIProvider[] = [
      {
        id: "custom-1",
        name: "XXXカスタム",
        baseUrl: "http://localhost:11434/v1",
        modelIds: ["bbb aaaaa"],
        apiKey: "",
      },
    ];
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
    const custom: CustomOpenAIProvider[] = [
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        modelIds: ["llama"],
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
    expect(models).toEqual([{ id: "llama", name: "llama", providerId: "ollama", thinkingLevels: [] }]);
  });

  it("returns every configured custom model id", async () => {
    const custom: CustomOpenAIProvider[] = [
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        modelIds: ["llama", "mistral", "llama"],
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
      { id: "llama", name: "llama", providerId: "ollama", thinkingLevels: [] },
      { id: "mistral", name: "mistral", providerId: "ollama", thinkingLevels: [] },
    ]);
  });

  it("sorts custom model ids by name", async () => {
    const custom: CustomOpenAIProvider[] = [
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        modelIds: ["mistral", "llama"],
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
    expect(models.map((model) => model.id)).toEqual(["llama", "mistral"]);
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
});
