import { describe, expect, it } from "vitest";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { CredentialResolver } from "../../application/CredentialResolver";
import { DEFAULT_SETTINGS, type CustomOpenAIProvider } from "../../settings/Settings";
import { createCredentialResolver } from "./PiCredentials";
import { PiModelCatalog } from "./PiModelCatalog";

function catalog(options: {
  providerIds?: string[];
  custom?: CustomOpenAIProvider[];
  credentials: CredentialResolver;
}): PiModelCatalog {
  const runtime = {
    getProviders: () =>
      (options.providerIds ?? ["openai", "anthropic"]).map((id) => ({
        id,
        name: id,
      })),
    getModels: () => [],
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

  it("includes a custom provider only when it has an API key", async () => {
    const custom: CustomOpenAIProvider[] = [
      {
        id: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        modelId: "llama",
        apiKey: "local",
      },
      {
        id: "empty",
        name: "Empty",
        baseUrl: "http://localhost:1234/v1",
        modelId: "x",
        apiKey: "",
      },
    ];
    const listed = await catalog({
      providerIds: [],
      custom,
      credentials: createCredentialResolver(() => ({
        ...DEFAULT_SETTINGS,
        apiKeys: { ollama: "local" },
        customProviders: custom,
      })),
    }).listProviders();
    expect(listed.map((provider) => provider.id)).toEqual(["ollama"]);
  });
});
