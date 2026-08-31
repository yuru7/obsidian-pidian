import { describe, expect, it } from "vitest";
import { SearchFailedError } from "../../domain/search/SearchErrors";
import { WEB_ACCESS_USER_AGENT } from "../http/webAccess";
import {
  FIRECRAWL_SEARCH_URL,
  FirecrawlSearchProvider,
} from "./FirecrawlSearchProvider";

const SUCCESS_BODY = {
  success: true,
  data: {
    web: [
      {
        title: "Pi coding agent",
        description: "Pi coding agent is a CLI coding assistant.",
        url: "https://example.com/pi",
      },
      {
        title: "Pi documentation",
        description: "Documentation for Pi.",
        url: "https://docs.example.com/pi",
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("FirecrawlSearchProvider", () => {
  it("POSTs a keyless web search and maps description to snippet", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(SUCCESS_BODY);
    };
    const provider = new FirecrawlSearchProvider(fetchFn, { retryDelayMs: () => 0 });
    const response = await provider.search("Pi coding agent", { maxResults: 1 });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(FIRECRAWL_SEARCH_URL);
    const headers = new Headers(requests[0]?.init?.headers);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("User-Agent")).toBe(WEB_ACCESS_USER_AGENT);
    expect(headers.get("Authorization")).toBeNull();
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      query: "Pi coding agent",
      limit: 1,
      sources: ["web"],
      ignoreInvalidURLs: true,
      timeout: 25_000,
    });
    expect(response).toEqual({
      provider: "firecrawl",
      results: [
        {
          title: "Pi coding agent",
          url: "https://example.com/pi",
          snippet: "Pi coding agent is a CLI coding assistant.",
        },
      ],
    });
  });

  it("sends Bearer auth only when an API key is set", async () => {
    let apiKey = "  fc-secret  ";
    const headersSeen: string[] = [];
    const fetchFn: typeof fetch = async (_input, init) => {
      headersSeen.push(new Headers(init?.headers).get("Authorization") ?? "");
      return jsonResponse({ success: true, data: { web: [] } });
    };
    const provider = new FirecrawlSearchProvider(fetchFn, {
      getApiKey: () => apiKey,
      retryDelayMs: () => 0,
    });

    await provider.search("Pi");
    apiKey = "";
    await provider.search("Pi");

    expect(headersSeen).toEqual(["Bearer fc-secret", ""]);
  });

  it("maps domainFilters to includeDomains", async () => {
    let body = "";
    const fetchFn: typeof fetch = async (_input, init) => {
      body = String(init?.body);
      return jsonResponse(SUCCESS_BODY);
    };
    const provider = new FirecrawlSearchProvider(fetchFn, { retryDelayMs: () => 0 });
    const response = await provider.search("Pi", { domainFilters: ["https://example.com/docs", "docs.example.com"] });

    expect(JSON.parse(body).includeDomains).toEqual(["example.com", "docs.example.com"]);
    expect(response.results.map((item) => item.url)).toEqual(["https://example.com/pi", "https://docs.example.com/pi"]);
  });

  it("retries 429 then returns results", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({ success: false, error: "Rate limit exceeded" }, 429);
      }
      return jsonResponse(SUCCESS_BODY);
    };
    const provider = new FirecrawlSearchProvider(fetchFn, { retryDelayMs: () => 0 });
    const response = await provider.search("Pi");
    expect(attempts).toBe(2);
    expect(response.provider).toBe("firecrawl");
    expect(response.results).toHaveLength(2);
  });

  it("does not retry a 403", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      return jsonResponse({ success: false, error: "Forbidden" }, 403);
    };
    const provider = new FirecrawlSearchProvider(fetchFn, { retryDelayMs: () => 0 });
    await expect(provider.search("Pi")).rejects.toThrow(SearchFailedError);
    expect(attempts).toBe(1);
  });

  it("retries 5xx then throws after the last attempt", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      return jsonResponse({ success: false, error: "boom" }, 503);
    };
    const provider = new FirecrawlSearchProvider(fetchFn, { maxRetries: 2, retryDelayMs: () => 0 });
    await expect(provider.search("Pi")).rejects.toThrow(/Firecrawl search failed \(503\)/);
    expect(attempts).toBe(3);
  });

  it("treats success:false as a failed search", async () => {
    const fetchFn: typeof fetch = async () => jsonResponse({ success: false, error: "quota exceeded" });
    const provider = new FirecrawlSearchProvider(fetchFn, { retryDelayMs: () => 0 });
    await expect(provider.search("Pi")).rejects.toThrow("quota exceeded");
  });
});
