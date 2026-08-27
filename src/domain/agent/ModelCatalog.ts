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
}

export interface ModelCatalog {
  listProviders(): Promise<CatalogProvider[]>;
  listModels(providerId: string): Promise<CatalogModel[]>;
}
