import { describe, expect, it } from "vitest";
import { createSearchService } from "./createSearchService";

const FIRECRAWL_BODY = {
  success: true,
  data: {
    web: [{ title: "Pi", description: "from firecrawl", url: "https://example.com/firecrawl" }],
  },
};

const DUCKDUCKGO_HTML = `
<div class="result results_links web-result">
  <a class="result__a" href="https://example.com/ddg">DuckDuckGo result</a>
  <a class="result__snippet">from duckduckgo</a>
</div>
`;

describe("createSearchService", () => {
  it("tries Firecrawl before DuckDuckGo", async () => {
    const hosts: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      hosts.push(new URL(url).hostname);
      if (url.includes("firecrawl")) {
        return new Response(JSON.stringify(FIRECRAWL_BODY), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(DUCKDUCKGO_HTML, { status: 200, headers: { "content-type": "text/html" } });
    };
    const service = createSearchService(fetchFn, {
      firecrawl: { retryDelayMs: () => 0 },
    });
    expect(service.availableProviderIds()).toEqual(["firecrawl", "duckduckgo"]);

    const found = await service.search("Pi");
    expect(found.provider).toBe("firecrawl");
    expect(found.results[0]?.url).toBe("https://example.com/firecrawl");
    expect(hosts).toEqual(["api.firecrawl.dev"]);
  });

  it("falls back to DuckDuckGo when Firecrawl fails", async () => {
    const hosts: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      hosts.push(new URL(url).hostname);
      if (url.includes("firecrawl")) {
        return new Response(JSON.stringify({ success: false, error: "down" }), { status: 503 });
      }
      return new Response(DUCKDUCKGO_HTML, { status: 200, headers: { "content-type": "text/html" } });
    };
    const service = createSearchService(fetchFn, {
      firecrawl: { retryDelayMs: () => 0 },
    });
    const found = await service.search("Pi");
    expect(found.provider).toBe("duckduckgo");
    expect(found.results[0]?.title).toBe("DuckDuckGo result");
    expect(hosts[0]).toBe("api.firecrawl.dev");
    expect(hosts.some((host) => host.includes("duckduckgo"))).toBe(true);
  });
});
