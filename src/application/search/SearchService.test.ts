import { describe, expect, it } from "vitest";
import { SearchFailedError, SearchProviderUnavailableError } from "../../domain/search/SearchErrors";
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from "../../domain/search/SearchProvider";
import { formatWebSearchText, SearchProviderRegistry, SearchService } from "./SearchService";

class FakeProvider implements SearchProvider {
  readonly calls: Array<{ query: string; options: SearchOptions }> = [];

  constructor(
    readonly id: string,
    private readonly handler: (query: string, options: SearchOptions) => Promise<SearchResponse> | SearchResponse,
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchResponse> {
    this.calls.push({ query, options });
    return this.handler(query, options);
  }
}

function result(title: string, url: string): SearchResult {
  return { title, url, snippet: `${title} snippet` };
}

describe("SearchService", () => {
  it("falls back to the next provider when one fails", async () => {
    const failing = new FakeProvider("a", async () => {
      throw new Error("provider a down");
    });
    const succeeding = new FakeProvider("b", async () => ({
      provider: "b",
      results: [result("Pi", "https://example.com/pi")],
    }));
    const registry = new SearchProviderRegistry();
    registry.register(failing);
    registry.register(succeeding);
    const service = new SearchService(registry, ["a", "b"]);

    const found = await service.search("Pi coding agent");
    expect(found.provider).toBe("b");
    expect(found.results).toHaveLength(1);
    expect(failing.calls).toHaveLength(1);
    expect(succeeding.calls).toHaveLength(1);
  });

  it("does not fall back when a provider is specified", async () => {
    const failing = new FakeProvider("a", async () => {
      throw new Error("provider a down");
    });
    const succeeding = new FakeProvider("b", async () => ({
      provider: "b",
      results: [result("Pi", "https://example.com/pi")],
    }));
    const registry = new SearchProviderRegistry();
    registry.register(failing);
    registry.register(succeeding);
    const service = new SearchService(registry, ["a", "b"]);

    await expect(service.search("Pi", { provider: "a" })).rejects.toThrow("provider a down");
    expect(succeeding.calls).toHaveLength(0);
  });

  it("throws when the specified provider is unknown", async () => {
    const service = new SearchService(new SearchProviderRegistry(), ["duckduckgo"]);
    await expect(service.search("Pi", { provider: "brave" })).rejects.toBeInstanceOf(
      SearchProviderUnavailableError,
    );
  });

  it("throws when every provider fails", async () => {
    const failing = new FakeProvider("a", async () => {
      throw new Error("offline");
    });
    const registry = new SearchProviderRegistry();
    registry.register(failing);
    const service = new SearchService(registry, ["a"]);
    await expect(service.search("Pi")).rejects.toBeInstanceOf(SearchFailedError);
  });

  it("lists registered providers in configured order", () => {
    const registry = new SearchProviderRegistry();
    registry.register(new FakeProvider("firecrawl", async () => ({ provider: "firecrawl", results: [] })));
    registry.register(new FakeProvider("duckduckgo", async () => ({ provider: "duckduckgo", results: [] })));
    const service = new SearchService(registry, ["firecrawl", "duckduckgo"]);
    expect(service.availableProviderIds()).toEqual(["firecrawl", "duckduckgo"]);
  });

  it("clamps maxResults before calling the provider", async () => {
    const provider = new FakeProvider("a", async () => ({ provider: "a", results: [] }));
    const registry = new SearchProviderRegistry();
    registry.register(provider);
    const service = new SearchService(registry, ["a"]);
    await service.search("Pi", { maxResults: 99 });
    expect(provider.calls[0]?.options.maxResults).toBe(20);
  });
});

describe("formatWebSearchText", () => {
  it("formats numbered titles, URLs, and snippets", () => {
    const text = formatWebSearchText("Pi coding agent", {
      provider: "duckduckgo",
      results: [
        { title: "Pi coding agent", url: "https://example.com/pi", snippet: "Pi coding agent is ..." },
        { title: "Pi documentation", url: "https://example.com/docs", snippet: "Documentation for ..." },
      ],
    });
    expect(text).toBe(
      [
        "Provider: duckduckgo",
        "",
        "1. Pi coding agent",
        "https://example.com/pi",
        "",
        "Pi coding agent is ...",
        "",
        "2. Pi documentation",
        "https://example.com/docs",
        "",
        "Documentation for ...",
      ].join("\n"),
    );
  });

  it("reports when there are no results", () => {
    expect(formatWebSearchText("nothing", { provider: "duckduckgo", results: [] })).toBe(
      ['Provider: duckduckgo', "", 'No web search results for "nothing".'].join("\n"),
    );
  });
});
