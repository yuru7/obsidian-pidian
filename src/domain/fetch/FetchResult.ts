export const MIN_USEFUL_CONTENT_LENGTH = 500;
export const FETCH_TIMEOUT_MS = 30_000;
export const FETCH_MAX_BYTES = 5 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 5;

export type FetchExtractor = "readability" | "defuddle" | "text";

export interface FetchResult {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  extractor?: FetchExtractor;
}
