import {
  BlockedUrlError,
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
  type FetchedDocument,
} from "../../domain/fetch/FetchResult";
import { charsetOf, classifyMediaType, mediaTypeOf } from "../../domain/fetch/mediaType";
import { WEB_ACCESS_USER_AGENT } from "../http/webAccess";
import { abortAfter } from "./abortAfter";
import { SsrfGuard } from "./ssrfGuard";

export class StaticFetcher {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly guard: SsrfGuard,
    private readonly limits: {
      timeoutMs?: number;
      maxBytes?: number;
      maxRedirects?: number;
    } = {},
  ) {}

  async fetch(url: string, signal?: AbortSignal): Promise<FetchedDocument> {
    const timeoutMs = this.limits.timeoutMs ?? FETCH_TIMEOUT_MS;
    const maxBytes = this.limits.maxBytes ?? FETCH_MAX_BYTES;
    const maxRedirects = this.limits.maxRedirects ?? FETCH_MAX_REDIRECTS;
    const timeout = abortAfter(timeoutMs, signal);
    try {
      return await this.fetchFollowingRedirects(url, timeout.signal, maxBytes, maxRedirects);
    } catch (error) {
      if (isStaticFetchError(error)) {
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
  ): Promise<FetchedDocument> {
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
      const mediaType = mediaTypeOf(contentType);
      const kind = classifyMediaType(mediaType);
      if (kind === "unsupported") {
        throw new UnsupportedContentTypeError(mediaType);
      }
      return {
        url: originalUrl,
        finalUrl: safeUrl.href,
        status: response.status,
        contentType: mediaType,
        body: decodeBody(bytes, charsetOf(contentType)),
        source: "static",
      };
    }
    throw new FetchFailedError("Fetch failed (too many redirects).");
  }
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

function isStaticFetchError(error: unknown): boolean {
  return (
    error instanceof InvalidUrlError ||
    error instanceof BlockedUrlError ||
    error instanceof FetchTimeoutError ||
    error instanceof ResponseTooLargeError ||
    error instanceof UnsupportedContentTypeError ||
    error instanceof FetchFailedError
  );
}
