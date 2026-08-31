import { SearchProviderRegistry, SearchService } from "../../application/search/SearchService";
import { DuckDuckGoSearchProvider } from "./DuckDuckGoSearchProvider";
import { FirecrawlSearchProvider, type FirecrawlSearchProviderSettings } from "./FirecrawlSearchProvider";

export function createSearchService(
  fetchFn: typeof fetch,
  options: {
    getFirecrawlApiKey?: () => string | undefined;
    firecrawl?: FirecrawlSearchProviderSettings;
  } = {},
): SearchService {
  const registry = new SearchProviderRegistry();
  registry.register(
    new FirecrawlSearchProvider(fetchFn, {
      ...options.firecrawl,
      getApiKey: options.getFirecrawlApiKey ?? options.firecrawl?.getApiKey,
    }),
  );
  registry.register(new DuckDuckGoSearchProvider(fetchFn));
  return new SearchService(registry, ["firecrawl", "duckduckgo"]);
}
