import { SearchFailedError, SearchProviderUnavailableError } from "../../domain/search/SearchErrors";
import type { SearchProvider } from "../../domain/search/SearchProvider";
import {
  DEFAULT_SEARCH_MAX_RESULTS,
  MAX_SEARCH_RESULTS,
  type SearchOptions,
  type SearchResponse,
  type WebSearchResult,
} from "../../domain/search/SearchProvider";

export class SearchProviderRegistry {
  private readonly providers = new Map<string, SearchProvider>();

  register(provider: SearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): SearchProvider | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }
}

export interface SearchServiceOptions extends SearchOptions {
  provider?: string;
}

export function clampSearchMaxResults(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_SEARCH_MAX_RESULTS;
  }
  return Math.min(Math.max(1, Math.floor(value)), MAX_SEARCH_RESULTS);
}

export function formatWebSearchText(query: string, response: SearchResponse): string {
  const header = `Provider: ${response.provider}`;
  if (response.results.length === 0) {
    return `${header}\n\nNo web search results for "${query}".`;
  }
  const blocks = response.results.map((result, index) => {
    const lines = [`${index + 1}. ${result.title}`, result.url];
    if (result.snippet) {
      lines.push("", result.snippet);
    }
    return lines.join("\n");
  });
  return `${header}\n\n${blocks.join("\n\n")}`;
}

export class SearchService {
  constructor(
    private readonly registry: SearchProviderRegistry,
    private readonly providerIds: string[],
  ) {}

  availableProviderIds(): string[] {
    return this.providerIds.filter((id) => this.registry.has(id));
  }

  async search(query: string, options: SearchServiceOptions = {}): Promise<WebSearchResult> {
    const searchOptions: SearchOptions = {
      maxResults: clampSearchMaxResults(options.maxResults),
      domainFilters: options.domainFilters,
      signal: options.signal,
    };
    const response = options.provider
      ? await this.searchWithProvider(options.provider, query, searchOptions)
      : await this.searchWithFallback(query, searchOptions);
    return {
      query,
      provider: response.provider,
      results: response.results,
      text: formatWebSearchText(query, response),
    };
  }

  private async searchWithProvider(
    id: string,
    query: string,
    options: SearchOptions,
  ): Promise<SearchResponse> {
    const provider = this.registry.get(id);
    if (!provider) {
      throw new SearchProviderUnavailableError(id);
    }
    return provider.search(query, options);
  }

  private async searchWithFallback(query: string, options: SearchOptions): Promise<SearchResponse> {
    const errors: Error[] = [];
    for (const id of this.providerIds) {
      const provider = this.registry.get(id);
      if (!provider) {
        continue;
      }
      try {
        return await provider.search(query, options);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length === 0) {
      throw new SearchFailedError("No search providers are available.");
    }
    throw new SearchFailedError(errors[errors.length - 1]?.message ?? "Web search failed.");
  }
}
