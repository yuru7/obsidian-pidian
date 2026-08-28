import { SearchProviderRegistry, SearchService } from "../../application/search/SearchService";
import { DuckDuckGoSearchProvider } from "./DuckDuckGoSearchProvider";

export function createSearchService(fetchFn: typeof fetch): SearchService {
  const registry = new SearchProviderRegistry();
  registry.register(new DuckDuckGoSearchProvider(fetchFn));
  return new SearchService(registry, ["duckduckgo"]);
}
