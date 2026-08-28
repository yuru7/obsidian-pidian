import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { FetchService, formatFetchResult } from "../application/fetch/FetchService";
import {
  BlockedUrlError,
  ContentExtractionError,
  FetchFailedError,
  FetchTimeoutError,
  InvalidUrlError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
} from "../domain/fetch/FetchErrors";

export function createFetchUrlTool(options: {
  permissions: PermissionService;
  fetchService: FetchService;
}): PidianTool {
  return {
    name: "fetch_url",
    label: "Fetch URL",
    description:
      "Fetch and extract readable content from an HTTP or HTTPS URL. HTML pages are converted to Markdown. Use this after web_search when full page content is needed.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP or HTTPS URL to fetch.",
        },
      },
      required: ["url"],
    },
    execute: async (args) => {
      try {
        const url = parseFetchUrlArgs(args);
        const decision = await options.permissions.authorize({
          category: "webSearch",
          toolName: "fetch_url",
          summary: `Fetch ${url}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const result = await options.fetchService.fetch(url);
        return { content: formatFetchResult(result) };
      } catch (error) {
        if (isFetchToolError(error)) {
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

function parseFetchUrlArgs(args: unknown): string {
  if (typeof args !== "object" || args === null) {
    throw new InvalidUrlError("url is required.");
  }
  const url = (args as { url?: unknown }).url;
  if (typeof url !== "string" || !url.trim()) {
    throw new InvalidUrlError("url is required.");
  }
  return url.trim();
}

function isFetchToolError(error: unknown): error is Error {
  return (
    error instanceof InvalidUrlError ||
    error instanceof BlockedUrlError ||
    error instanceof FetchTimeoutError ||
    error instanceof ResponseTooLargeError ||
    error instanceof UnsupportedContentTypeError ||
    error instanceof ContentExtractionError ||
    error instanceof FetchFailedError
  );
}
