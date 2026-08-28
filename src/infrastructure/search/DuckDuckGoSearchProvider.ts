import { parseHTML } from "linkedom";
import { SearchFailedError } from "../../domain/search/SearchErrors";
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from "../../domain/search/SearchProvider";
import { DEFAULT_SEARCH_MAX_RESULTS } from "../../domain/search/SearchProvider";
import { WEB_ACCESS_USER_AGENT } from "../http/webAccess";

export { WEB_ACCESS_USER_AGENT };
export const DUCKDUCKGO_PROVIDER_ID = "duckduckgo";
export const DUCKDUCKGO_SEARCH_URL = "https://html.duckduckgo.com/html/";
export const SEARCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const { document } = parseHTML(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const node of Array.from(document.querySelectorAll("div.result"))) {
    if (node.classList.contains("result--ad") || node.closest(".results--ads")) {
      continue;
    }
    const anchor = node.querySelector("a.result__a");
    const title = anchor?.textContent?.trim() ?? "";
    const url = resolveDuckDuckGoUrl(anchor?.getAttribute("href") ?? "");
    if (!title || !url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const snippet = node.querySelector(".result__snippet")?.textContent?.trim();
    results.push(snippet ? { title, url, snippet } : { title, url });
  }

  return results;
}

export function resolveDuckDuckGoUrl(href: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith("javascript:")) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://duckduckgo.com/");
  } catch {
    return undefined;
  }
  const uddg = parsed.searchParams.get("uddg");
  if (uddg) {
    try {
      const target = new URL(uddg);
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        return undefined;
      }
      return target.href;
    } catch {
      return undefined;
    }
  }
  if (isDuckDuckGoHost(parsed.hostname)) {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  return parsed.href;
}

export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly id = DUCKDUCKGO_PROVIDER_ID;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly timeoutMs: number = SEARCH_TIMEOUT_MS,
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const html = await this.fetchHtml(query, options.signal);
    const maxResults = options.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
    const results = parseDuckDuckGoHtml(html)
      .filter((result) => matchesDomainFilters(result.url, options.domainFilters))
      .slice(0, maxResults);
    return { provider: this.id, results };
  }

  private async fetchHtml(query: string, signal?: AbortSignal): Promise<string> {
    const url = new URL(DUCKDUCKGO_SEARCH_URL);
    url.searchParams.set("q", query);
    const timeout = abortAfter(this.timeoutMs, signal);
    try {
      const response = await fetchFollowingRedirects(this.fetchFn, url.href, {
        method: "GET",
        redirect: "manual",
        signal: timeout.signal,
        headers: {
          Accept: "text/html",
          "User-Agent": WEB_ACCESS_USER_AGENT,
        },
      });
      if (!response.ok) {
        throw new SearchFailedError(`DuckDuckGo search failed (${response.status}).`);
      }
      return await response.text();
    } catch (error) {
      if (error instanceof SearchFailedError) {
        throw error;
      }
      if (timeout.signal.aborted && !signal?.aborted) {
        throw new SearchFailedError("Web search timed out.");
      }
      throw new SearchFailedError(error instanceof Error ? error.message : String(error));
    } finally {
      timeout.dispose();
    }
  }
}

function matchesDomainFilters(url: string, filters: string[] | undefined): boolean {
  const domains = (filters ?? []).map(normalizeDomainFilter).filter((item) => item.length > 0);
  if (domains.length === 0) {
    return true;
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function normalizeDomainFilter(filter: string): string {
  const trimmed = filter.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).hostname;
    }
  } catch {
    return "";
  }
  return trimmed.replace(/^\./, "").replace(/\/.*$/, "");
}

function isDuckDuckGoHost(hostname: string): boolean {
  return hostname === "duckduckgo.com" || hostname.endsWith(".duckduckgo.com");
}

function abortAfter(ms: number, parent?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onParentAbort = () => controller.abort();
  parent?.addEventListener("abort", onParentAbort);
  if (parent?.aborted) {
    controller.abort();
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

async function fetchFollowingRedirects(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetchFn(current, init);
    if (response.status < 300 || response.status >= 400) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new SearchFailedError("DuckDuckGo search failed (redirect without Location).");
    }
    current = new URL(location, current).href;
  }
  throw new SearchFailedError("DuckDuckGo search failed (too many redirects).");
}
