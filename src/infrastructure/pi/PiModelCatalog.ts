import { envVarNamesForProvider } from "./PiCredentials";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CredentialResolver } from "../../application/CredentialResolver";
import { sortCatalogModels, type CatalogModel, type CatalogProvider, type ModelCatalog } from "../../domain/agent/ModelCatalog";
import {
  customProviderModelIds,
  isConfiguredCustomProvider,
  type CustomOpenAIProvider,
} from "../../settings/Settings";

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
      .filter(isConfiguredCustomProvider)
      .map((provider) => ({
        id: provider.id,
        name: provider.name.trim() || provider.id,
        envVarNames: [] as string[],
        isCustom: true,
      }));
    const byId = new Map(providers.map((provider) => [provider.id, provider]));
    for (const provider of custom) {
      byId.set(provider.id, provider);
    }
    return [...byId.values()].filter(
      (provider) => provider.isCustom || this.credentials.hasCredential(provider.id),
    );
  }

  async listModels(providerId: string): Promise<CatalogModel[]> {
    const custom = this.getCustomProviders().find((provider) => provider.id === providerId);
    if (custom) {
      return sortCatalogModels(
        customProviderModelIds(custom).map((modelId) => ({
          id: modelId,
          name: modelId,
          providerId: custom.id,
        })),
      );
    }
    const runtime = await this.getRuntime();
    return sortCatalogModels(
      runtime.getModels(providerId).map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        providerId: model.provider,
      })),
    );
  }
}
