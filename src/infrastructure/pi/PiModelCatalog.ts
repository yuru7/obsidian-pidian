import { envVarNamesForProvider } from "./PiCredentials";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CredentialResolver } from "../../application/CredentialResolver";
import type { CatalogModel, CatalogProvider, ModelCatalog } from "../../domain/agent/ModelCatalog";
import type { CustomOpenAIProvider } from "../../settings/Settings";

export class PiModelCatalog implements ModelCatalog {
  constructor(
    private readonly getRuntime: () => Promise<ModelRuntime>,
    private readonly getCustomProviders: () => CustomOpenAIProvider[],
    private readonly credentials: CredentialResolver,
  ) {}

  async listProviders(): Promise<CatalogProvider[]> {
    let providers: CatalogProvider[] = [];
    try {
      const runtime = await this.getRuntime();
      providers = runtime.getProviders().map((provider) => ({
        id: provider.id,
        name: provider.name,
        envVarNames: envVarNamesForProvider(provider.id),
      }));
    } catch {
      providers = [];
    }
    const custom = this.getCustomProviders()
      .filter((provider) => provider.baseUrl.trim() && provider.modelId.trim())
      .map((provider) => ({
        id: provider.id,
        name: provider.name.trim() || provider.id,
        envVarNames: [] as string[],
        isCustom: true,
      }));
    const seen = new Set(providers.map((provider) => provider.id));
    return [...providers, ...custom.filter((provider) => !seen.has(provider.id))].filter(
      (provider) => provider.isCustom || this.credentials.hasCredential(provider.id),
    );
  }

  async listModels(providerId: string): Promise<CatalogModel[]> {
    const custom = this.getCustomProviders().find((provider) => provider.id === providerId);
    if (custom) {
      const modelId = custom.modelId.trim();
      if (!modelId) {
        return [];
      }
      return [
        {
          id: modelId,
          name: modelId,
          providerId: custom.id,
        },
      ];
    }
    const runtime = await this.getRuntime();
    return runtime.getModels(providerId).map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      providerId: model.provider,
    }));
  }
}
