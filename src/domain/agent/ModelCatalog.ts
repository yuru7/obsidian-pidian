export interface CatalogProvider {
  id: string;
  name: string;
  envVarNames: string[];
  isCustom?: boolean;
}

export interface CatalogModelCostRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CatalogModelCostTier extends CatalogModelCostRates {
  /** Apply this tier when input + cache tokens exceed this count. */
  inputTokensAbove: number;
}

/** USD per million tokens from the model catalog. Missing on custom OpenAI Compatible models. */
export interface CatalogModelCost extends CatalogModelCostRates {
  tiers?: CatalogModelCostTier[];
}

export interface CatalogModel {
  id: string;
  name: string;
  providerId: string;
  thinkingLevels: string[];
  /** True when the model accepts image input. */
  supportsImages?: boolean;
  /** Catalog pricing. Omitted when unknown or for custom OpenAI Compatible models. */
  cost?: CatalogModelCost;
}

export interface ModelCatalog {
  listProviders(): Promise<CatalogProvider[]>;
  listModels(providerId: string): Promise<CatalogModel[]>;
}

export function sortCatalogModels(models: readonly CatalogModel[]): CatalogModel[] {
  return [...models].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
}
