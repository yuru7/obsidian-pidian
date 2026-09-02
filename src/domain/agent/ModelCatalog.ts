export interface CatalogProvider {
  id: string;
  name: string;
  envVarNames: string[];
  isCustom?: boolean;
}

export interface CatalogModel {
  id: string;
  name: string;
  providerId: string;
  thinkingLevels: string[];
  /** True when the model accepts image input. */
  supportsImages?: boolean;
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
