import { SearchFailedError } from "../../domain/search/SearchErrors";
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from "../../domain/search/SearchProvider";
import { DEFAULT_SEARCH_MAX_RESULTS } from "../../domain/search/SearchProvider";
import { WEB_ACCESS_USER_AGENT } from "../http/webAccess";

export const FIRECRAWL_PROVIDER_ID = "firecrawl";
export const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
export const FIRECRAWL_HTTP_TIMEOUT_MS = 30_000;
export const FIRECRAWL_API_TIMEOUT_MS = 25_000;
export const FIRECRAWL_MAX_RETRIES = 2;

export interface FirecrawlSearchProviderSettings {
  getApiKey?: () => string | undefined;
  timeoutMs?: number;
  apiTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
}

interface FirecrawlWebHit {
  title?: unknown;
  description?: unknown;
  url?: unknown;
}

interface FirecrawlSearchBody {
  success?: unknown;
  error?: unknown;
  message?: unknown;
  data?: {
    web?: FirecrawlWebHit[];
  };
}

export class FirecrawlSearchProvider implements SearchProvider {
  readonly id = FIRECRAWL_PROVIDER_ID;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly settings: FirecrawlSearchProviderSettings = {},
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const maxResults = options.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
    const body = JSON.stringify(this.requestBody(query, maxResults, options.domainFilters));
    const payload = await this.request(body, options.signal);
    const results = parseFirecrawlWebResults(payload)
      .filter((result) => matchesDomainFilters(result.url, options.domainFilters))
      .slice(0, maxResults);
    return { provider: this.id, results };
  }

  private requestBody(query: string, limit: number, domainFilters: string[] | undefined): Record<string, unknown> {
    const body: Record<string, unknown> = {
      query,
      limit,
      sources: ["web"],
      ignoreInvalidURLs: true,
      timeout: this.settings.apiTimeoutMs ?? FIRECRAWL_API_TIMEOUT_MS,
    };
    const includeDomains = (domainFilters ?? []).map(normalizeDomainFilter).filter((item) => item.length > 0);
    if (includeDomains.length > 0) {
      body.includeDomains = includeDomains;
    }
    return body;
  }

  private async request(body: string, signal?: AbortSignal): Promise<FirecrawlSearchBody> {
    const maxRetries = this.settings.maxRetries ?? FIRECRAWL_MAX_RETRIES;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(this.retryDelayMs(attempt - 1), signal);
      }
      try {
        return await this.requestOnce(body, signal);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!isRetryableSearchError(error) || attempt === maxRetries || signal?.aborted) {
          throw lastError;
        }
      }
    }
    throw lastError ?? new SearchFailedError("Firecrawl search failed.");
  }

  private async requestOnce(body: string, signal?: AbortSignal): Promise<FirecrawlSearchBody> {
    const timeoutMs = this.settings.timeoutMs ?? FIRECRAWL_HTTP_TIMEOUT_MS;
    const timeout = abortAfter(timeoutMs, signal);
    try {
      const response = await this.fetchFn(FIRECRAWL_SEARCH_URL, {
        method: "POST",
        signal: timeout.signal,
        headers: this.headers(),
        body,
      });
      const payload = await readJsonBody(response);
      if (!response.ok) {
        throw statusError(response.status, payload);
      }
      if (payload.success === false) {
        throw new SearchFailedError(firecrawlErrorMessage(payload) ?? "Firecrawl search failed.");
      }
      return payload;
    } catch (error) {
      if (error instanceof SearchFailedError) {
        throw error;
      }
      if (timeout.signal.aborted && !signal?.aborted) {
        throw new RetryableSearchFailedError("Firecrawl search timed out.");
      }
      if (signal?.aborted) {
        throw error instanceof Error ? error : new SearchFailedError(String(error));
      }
      throw new RetryableSearchFailedError(
        error instanceof Error ? error.message : "Firecrawl search failed (network).",
      );
    } finally {
      timeout.dispose();
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": WEB_ACCESS_USER_AGENT,
    };
    const apiKey = this.settings.getApiKey?.()?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  private retryDelayMs(attempt: number): number {
    return this.settings.retryDelayMs?.(attempt) ?? 400 * 2 ** attempt;
  }
}

class RetryableSearchFailedError extends SearchFailedError {}

function parseFirecrawlWebResults(payload: FirecrawlSearchBody): SearchResult[] {
  const hits = payload.data?.web;
  if (!Array.isArray(hits)) {
    return [];
  }
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const title = typeof hit.title === "string" ? hit.title.trim() : "";
    const url = typeof hit.url === "string" ? hit.url.trim() : "";
    if (!title || !url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const snippet = typeof hit.description === "string" ? hit.description.trim() : "";
    results.push(snippet ? { title, url, snippet } : { title, url });
  }
  return results;
}

async function readJsonBody(response: Response): Promise<FirecrawlSearchBody> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as FirecrawlSearchBody;
  } catch {
    if (response.ok) {
      throw new SearchFailedError(`Firecrawl search failed (${response.status}).`);
    }
    return {};
  }
}

function statusError(status: number, payload: FirecrawlSearchBody): SearchFailedError {
  const detail = firecrawlErrorMessage(payload);
  const suffix = detail ? `: ${detail}` : "";
  if (status === 408) {
    return new RetryableSearchFailedError(`Firecrawl search timed out${suffix}.`);
  }
  if (status === 429) {
    return new RetryableSearchFailedError(`Firecrawl search is rate limited${suffix}.`);
  }
  if (status >= 500) {
    return new RetryableSearchFailedError(`Firecrawl search failed (${status})${suffix}.`);
  }
  return new SearchFailedError(`Firecrawl search failed (${status})${suffix}.`);
}

function firecrawlErrorMessage(payload: FirecrawlSearchBody): string | undefined {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return undefined;
}

function isRetryableSearchError(error: unknown): boolean {
  return error instanceof RetryableSearchFailedError;
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

function abortAfter(ms: number, parent?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  const onParentAbort = () => controller.abort();
  parent?.addEventListener("abort", onParentAbort);
  if (parent?.aborted) {
    controller.abort();
  }
  return {
    signal: controller.signal,
    dispose: () => {
      window.clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) {
      return Promise.reject(abortError(signal));
    }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(_signal?: AbortSignal): Error {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
