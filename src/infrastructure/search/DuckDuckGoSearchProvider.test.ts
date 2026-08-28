import { describe, expect, it } from "vitest";
import { SearchFailedError } from "../../domain/search/SearchErrors";
import {
  DuckDuckGoSearchProvider,
  parseDuckDuckGoHtml,
  resolveDuckDuckGoUrl,
  WEB_ACCESS_USER_AGENT,
} from "./DuckDuckGoSearchProvider";

const FIXTURE_HTML = `
<div id="links" class="results">
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpi&rut=abc">Pi coding agent</a>
    </h2>
    <a class="result__snippet">Pi coding agent is a CLI coding assistant.</a>
  </div>
  <div class="result result--ad">
    <a class="result__a" href="https://ads.example.com/buy">Buy ads</a>
    <a class="result__snippet">Sponsored product</a>
  </div>
  <div class="results--ads">
    <div class="result">
      <a class="result__a" href="https://ads.example.com/other">Another ad</a>
    </div>
  </div>
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://docs.example.com/pi">Pi documentation</a>
    </h2>
    <a class="result__snippet">Documentation for Pi.</a>
  </div>
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/y.js?ad=1">Tracker</a>
    </h2>
  </div>
  <div class="result results_links web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://blog.example.org/pi">Pi blog</a>
    </h2>
    <a class="result__snippet">A blog post about Pi.</a>
  </div>
</div>
`;

describe("parseDuckDuckGoHtml", () => {
  it("extracts titles, URLs, and snippets while skipping ads and trackers", () => {
    const results = parseDuckDuckGoHtml(FIXTURE_HTML);
    expect(results).toEqual([
      {
        title: "Pi coding agent",
        url: "https://example.com/pi",
        snippet: "Pi coding agent is a CLI coding assistant.",
      },
      {
        title: "Pi documentation",
        url: "https://docs.example.com/pi",
        snippet: "Documentation for Pi.",
      },
      {
        title: "Pi blog",
        url: "https://blog.example.org/pi",
        snippet: "A blog post about Pi.",
      },
    ]);
  });
});

describe("resolveDuckDuckGoUrl", () => {
  it("decodes the uddg redirect parameter", () => {
    expect(
      resolveDuckDuckGoUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemplo.com%2Fnoticia&rut=abc123"),
    ).toBe("https://exemplo.com/noticia");
  });

  it("keeps a direct http URL", () => {
    expect(resolveDuckDuckGoUrl("https://docs.example.com/pi")).toBe("https://docs.example.com/pi");
  });
});

describe("DuckDuckGoSearchProvider", () => {
  it("sends the query and User-Agent, then applies maxResults and domain filters", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    };
    const provider = new DuckDuckGoSearchProvider(fetchFn);
    const response = await provider.search("Pi coding agent", {
      maxResults: 1,
      domainFilters: ["example.com"],
    });

    expect(requests[0]?.url).toContain("https://html.duckduckgo.com/html/");
    expect(requests[0]?.url).toContain("q=Pi+coding+agent");
    expect(new Headers(requests[0]?.init?.headers).get("User-Agent")).toBe(WEB_ACCESS_USER_AGENT);
    expect(response).toEqual({
      provider: "duckduckgo",
      results: [
        {
          title: "Pi coding agent",
          url: "https://example.com/pi",
          snippet: "Pi coding agent is a CLI coding assistant.",
        },
      ],
    });
  });

  it("includes subdomains when filtering by domain", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    const provider = new DuckDuckGoSearchProvider(fetchFn);
    const response = await provider.search("Pi", { domainFilters: ["example.com"] });
    expect(response.results.map((item) => item.url)).toEqual([
      "https://example.com/pi",
      "https://docs.example.com/pi",
    ]);
  });

  it("throws when DuckDuckGo returns an error status", async () => {
    const fetchFn: typeof fetch = async () => new Response("blocked", { status: 403 });
    const provider = new DuckDuckGoSearchProvider(fetchFn);
    await expect(provider.search("Pi")).rejects.toBeInstanceOf(SearchFailedError);
  });
});
