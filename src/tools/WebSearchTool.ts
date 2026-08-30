import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { SearchService } from "../application/search/SearchService";
import { SearchFailedError, SearchProviderUnavailableError } from "../domain/search/SearchErrors";
import { MAX_SEARCH_RESULTS } from "../domain/search/SearchProvider";

export function createWebSearchTool(options: {
  permissions: PermissionService;
  search: SearchService;
}): PidianTool {
  return {
    name: "web_search",
    label: "Web search",
    description:
      "Search the web and return matching pages with titles, URLs, and snippets. Use fetch_url when the contents of a result page are needed.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 5. Capped at 20.",
        },
        provider: {
          type: "string",
          description: "Search provider id. Defaults to the configured provider order. Currently: duckduckgo.",
        },
        domainFilters: {
          type: "array",
          description: "Only include results whose hostname matches one of these domains.",
          items: { type: "string" },
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      try {
        const parsed = parseWebSearchArgs(args);
        const decision = await options.permissions.authorize({
          category: "webSearch",
          toolName: "web_search",
          summary: `Search the web for "${parsed.query}"`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const result = await options.search.search(parsed.query, {
          maxResults: parsed.maxResults,
          provider: parsed.provider,
          domainFilters: parsed.domainFilters,
        });
        return { content: result.text };
      } catch (error) {
        if (error instanceof SearchProviderUnavailableError || error instanceof SearchFailedError) {
          return { content: error.message, isError: true };
        }
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
  };
}

function parseWebSearchArgs(args: unknown): {
  query: string;
  maxResults?: number;
  provider?: string;
  domainFilters?: string[];
} {
  if (typeof args !== "object" || args === null) {
    throw new Error("query is required.");
  }
  const record = args as {
    query?: unknown;
    maxResults?: unknown;
    provider?: unknown;
    domainFilters?: unknown;
  };
  if (typeof record.query !== "string" || !record.query.trim()) {
    throw new Error("query is required.");
  }
  const maxResults = parseMaxResults(record.maxResults);
  const provider = parseOptionalString(record.provider, "provider");
  const domainFilters = parseDomainFilters(record.domainFilters);
  return {
    query: record.query.trim(),
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(provider ? { provider } : {}),
    ...(domainFilters ? { domainFilters } : {}),
  };
}

function parseMaxResults(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error("maxResults must be a positive number.");
  }
  return Math.min(Math.floor(value), MAX_SEARCH_RESULTS);
}

function parseOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function parseDomainFilters(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("domainFilters must be an array of strings.");
  }
  const filters: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new Error("domainFilters must be an array of strings.");
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      filters.push(trimmed);
    }
  }
  return filters.length > 0 ? filters : undefined;
}
