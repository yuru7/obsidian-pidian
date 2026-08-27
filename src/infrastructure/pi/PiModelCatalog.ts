import { envVarNamesForProvider } from "./PiCredentials";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CatalogModel, CatalogProvider, ModelCatalog } from "../../domain/agent/ModelCatalog";
import type { CustomOpenAIProvider } from "../../settings/Settings";

export class PiModelCatalog implements ModelCatalog {
  constructor(
    private readonly getRuntime: () => Promise<ModelRuntime>,
    private readonly getCustomProviders: () => CustomOpenAIProvider[],
  ) {}

  async listProviders(): Promise<CatalogProvider[]> {
    const runtime = await this.getRuntime();
    const providers = runtime.getProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      envVarNames: envVarNamesForProvider(provider.id),
    }));
    const custom = this.getCustomProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      envVarNames: [] as string[],
      isCustom: true,
    }));
    const seen = new Set(providers.map((provider) => provider.id));
    return [...providers, ...custom.filter((provider) => !seen.has(provider.id))];
  }

  async listModels(providerId: string): Promise<CatalogModel[]> {
    const custom = this.getCustomProviders().find((provider) => provider.id === providerId);
    if (custom) {
      return [
        {
          id: custom.modelId,
          name: custom.modelId,
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
