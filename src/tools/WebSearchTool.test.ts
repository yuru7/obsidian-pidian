import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import { SearchProviderRegistry, SearchService } from "../application/search/SearchService";
import type { SearchProvider, SearchResponse } from "../domain/search/SearchProvider";
import { createWebSearchTool } from "./WebSearchTool";

class FakeProvider implements SearchProvider {
  readonly id = "fake";

  constructor(private readonly results: SearchResponse["results"]) {}

  async search(): Promise<SearchResponse> {
    return { provider: this.id, results: this.results };
  }
}

function permissions(webSearch: "allow" | "ask" | "deny") {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch }),
    { confirm: async () => true },
  );
}

function toolWith(provider: SearchProvider, webSearch: "allow" | "ask" | "deny" = "allow") {
  const registry = new SearchProviderRegistry();
  registry.register(provider);
  return createWebSearchTool({
    permissions: permissions(webSearch),
    search: new SearchService(registry, [provider.id]),
  });
}

describe("web_search", () => {
  it("uses webSearch permission and refuses when it is deny", async () => {
    const tool = toolWith(new FakeProvider([{ title: "Pi", url: "https://example.com" }]), "deny");
    const result = await tool.execute({ query: "Pi coding agent" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("returns formatted search results when allowed", async () => {
    const tool = toolWith(
      new FakeProvider([
        { title: "Pi coding agent", url: "https://example.com/pi", snippet: "Pi coding agent is ..." },
      ]),
    );
    const result = await tool.execute({ query: "Pi coding agent" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe(
      [
        "Provider: fake",
        "",
        "1. Pi coding agent",
        "https://example.com/pi",
        "",
        "Pi coding agent is ...",
      ].join("\n"),
    );
  });

  it("rejects a missing query", async () => {
    const tool = toolWith(new FakeProvider([]));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content).toBe("query is required.");
  });

  it("returns an error for an unknown provider", async () => {
    const tool = toolWith(new FakeProvider([]));
    const result = await tool.execute({ query: "Pi", provider: "brave" });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("Unknown search provider: brave");
  });
});
