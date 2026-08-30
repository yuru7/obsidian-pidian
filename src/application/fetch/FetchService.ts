import {
  BlockedUrlError,
  ContentExtractionError,
  FetchFailedError,
  FetchTimeoutError,
  InvalidUrlError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
} from "../../domain/fetch/FetchErrors";
import {
  FETCH_MAX_BYTES,
  FETCH_MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  type FetchResult,
} from "../../domain/fetch/FetchResult";
import { extractHtml } from "../../infrastructure/fetch/htmlExtractor";
import { SsrfGuard } from "../../infrastructure/fetch/ssrfGuard";
import { WEB_ACCESS_USER_AGENT } from "../../infrastructure/http/webAccess";

export function formatFetchResult(result: FetchResult): string {
  const lines: string[] = [];
  if (result.title) {
    lines.push(`Title: ${result.title}`, "");
  }
  lines.push(`URL: ${result.finalUrl}`, "", result.content);
  return lines.join("\n");
}

export class FetchService {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly guard: SsrfGuard,
    private readonly limits: {
      timeoutMs?: number;
      maxBytes?: number;
      maxRedirects?: number;
    } = {},
  ) {}

  async fetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
    const timeoutMs = this.limits.timeoutMs ?? FETCH_TIMEOUT_MS;
    const maxBytes = this.limits.maxBytes ?? FETCH_MAX_BYTES;
    const maxRedirects = this.limits.maxRedirects ?? FETCH_MAX_REDIRECTS;
    const timeout = abortAfter(timeoutMs, signal);
    try {
      return await this.fetchFollowingRedirects(url, timeout.signal, maxBytes, maxRedirects);
    } catch (error) {
      if (isFetchDomainError(error)) {
        throw error;
      }
      if (timeout.signal.aborted && !signal?.aborted) {
        throw new FetchTimeoutError();
      }
      throw new FetchFailedError(error instanceof Error ? error.message : String(error));
    } finally {
      timeout.dispose();
    }
  }

  private async fetchFollowingRedirects(
    originalUrl: string,
    signal: AbortSignal,
    maxBytes: number,
    maxRedirects: number,
  ): Promise<FetchResult> {
    let current = originalUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const safeUrl = await this.guard.assertSafe(current);
      const response = await this.fetchFn(safeUrl.href, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,application/json;q=0.8,*/*;q=0.1",
          "User-Agent": WEB_ACCESS_USER_AGENT,
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw new FetchFailedError("Fetch failed (redirect without Location).");
        }
        current = new URL(location, safeUrl.href).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new FetchFailedError(`Fetch failed (${response.status}).`);
      }
      const bytes = await readLimitedBody(response, maxBytes);
      const contentType = response.headers.get("content-type") ?? "";
      return this.toResult(originalUrl, safeUrl.href, contentType, bytes);
    }
    throw new FetchFailedError("Fetch failed (too many redirects).");
  }

  private async toResult(
    url: string,
    finalUrl: string,
    contentType: string,
    bytes: Uint8Array,
  ): Promise<FetchResult> {
    const mediaType = mediaTypeOf(contentType);
    const kind = classifyMediaType(mediaType);
    if (kind === "unsupported") {
      throw new UnsupportedContentTypeError(mediaType);
    }
    const content = decodeBody(bytes, charsetOf(contentType));
    if (kind === "text") {
      return { url, finalUrl, contentType: mediaType, content, extractor: "text" };
    }
    const extracted = await extractHtml(content, finalUrl);
    return {
      url,
      finalUrl,
      contentType: mediaType,
      content: extracted.content,
      extractor: extracted.extractor,
      ...(extracted.title ? { title: extracted.title } : {}),
    };
  }
}

export function classifyMediaType(mediaType: string): "html" | "text" | "unsupported" {
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
    return "html";
  }
  if (mediaType.startsWith("text/")) {
    return "text";
  }
  if (mediaType === "application/json" || mediaType.endsWith("+json")) {
    return "text";
  }
  if (mediaType === "application/xml" || mediaType.endsWith("+xml")) {
    return "text";
  }
  return "unsupported";
}

function mediaTypeOf(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function charsetOf(contentType: string): string {
  const match = /charset\s*=\s*("?)([^;"]+)\1/i.exec(contentType);
  return match?.[2]?.trim() || "utf-8";
}

function decodeBody(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ResponseTooLargeError();
    }
  }
  if (!response.body) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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

function isFetchDomainError(error: unknown): boolean {
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
