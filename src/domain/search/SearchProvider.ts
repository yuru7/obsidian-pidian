export const DEFAULT_SEARCH_MAX_RESULTS = 5;
export const MAX_SEARCH_RESULTS = 20;

export interface SearchOptions {
  maxResults?: number;
  domainFilters?: string[];
  signal?: AbortSignal;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface SearchResponse {
  provider: string;
  results: SearchResult[];
}

export interface SearchProvider {
  readonly id: string;

  search(query: string, options: SearchOptions): Promise<SearchResponse>;
}

export interface WebSearchResult {
  query: string;
  provider: string;
  results: SearchResult[];
  text: string;
}
