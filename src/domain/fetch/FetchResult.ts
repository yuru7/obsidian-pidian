export const MIN_USEFUL_CONTENT_LENGTH = 500;
export const FETCH_TIMEOUT_MS = 30_000;
export const FETCH_MAX_BYTES = 5 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 5;
export const BROWSER_FETCH_TIMEOUT_MS = 15_000;
export const BROWSER_POST_LOAD_WAIT_MS = 300;
export const BROWSER_STABILITY_INTERVAL_MS = 250;
export const BROWSER_STABILITY_CHECKS = 4;

export type FetchExtractor = "readability" | "defuddle" | "text";
export type FetchMode = "auto" | "static" | "browser";
export type FetchedSource = "static" | "browser";
export type ExtractionStatus = "success" | "javascript-required" | "extraction-failed";

export interface FetchedDocument {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  source: FetchedSource;
}

export type ExtractionResult =
  | { status: "success"; title?: string; content: string; extractor: Exclude<FetchExtractor, "text"> }
  | { status: "javascript-required" }
  | { status: "extraction-failed" };

export interface FetchResult {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  extractor?: FetchExtractor;
}
