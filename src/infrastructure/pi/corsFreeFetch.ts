import * as http from "node:http";
import * as https from "node:https";
import * as zlib from "node:zlib";
import type { IncomingMessage } from "node:http";
import type { FetchFunction } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/**
 * Obsidian's renderer `fetch` is Chromium's, so cross-origin POSTs trigger a CORS
 * preflight. OpenCode Go's `/zen/go/v1/*` does not answer OPTIONS with
 * Access-Control-Allow-Origin.
 *
 * undici's fetch is the Node CLI path, but in Electron's renderer `setTimeout`
 * returns a number (no `.unref`) and `markResourceTiming` is missing.
 * `requestUrl` cannot stream, which chat completions need.
 *
 * Node's `http`/`https` uses the OS network stack, so there is no preflight.
 */
export const corsFreeFetch: FetchFunction = async (input, init) => {
  const url = requestUrlFrom(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Unsupported protocol: ${url.protocol}`);
  }

  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (signal?.aborted) {
    throw abortError(signal);
  }

  const headers = requestHeadersFrom(input, init);
  const body = await requestBodyFrom(input, init);
  if (signal?.aborted) {
    throw abortError(signal);
  }

  const lib = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        try {
          const decoder = decoderForContentEncoding(res);
          resolve(
            new Response(webResponseBody(res, decoder), {
              status: res.statusCode ?? 200,
              statusText: res.statusMessage ?? "",
              headers: incomingToHeaders(res, Boolean(decoder)),
            }),
          );
        } catch (error) {
          res.destroy();
          reject(error);
        }
      },
    );

    const onAbort = () => {
      req.destroy(abortError(signal));
    };
    req.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.aborted ? abortError(signal) : error);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    req.end(body);
  });
};

const FETCH_METHODS = [
  "stream",
  "streamSimple",
  "complete",
  "completeSimple",
  "fetchDeferred",
  "cancelDeferred",
] as const;

type FetchOptions = { fetch?: FetchFunction };

export function injectCorsFreeFetch(
  runtime: ModelRuntime,
  fetch: FetchFunction = corsFreeFetch,
): ModelRuntime {
  for (const name of FETCH_METHODS) {
    const original = (
      runtime[name] as (
        model: unknown,
        contextOrHandle: unknown,
        options?: FetchOptions,
      ) => unknown
    ).bind(runtime);
    Object.defineProperty(runtime, name, {
      configurable: true,
      writable: true,
      value: (model: unknown, contextOrHandle: unknown, options?: FetchOptions) =>
        original(model, contextOrHandle, { ...options, fetch: options?.fetch ?? fetch }),
    });
  }
  return runtime;
}

/** Catalog refresh uses Pi's global `fetch`, so swap it for the duration of `run`. */
export async function withCorsFreeFetch<T>(
  run: () => Promise<T>,
  fetch: FetchFunction = corsFreeFetch,
): Promise<T> {
  const original = window.fetch.bind(window);
  window.fetch = fetch;
  try {
    return await run();
  } finally {
    window.fetch = original;
  }
}

function requestUrlFrom(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === "string") {
    return new URL(input);
  }
  return new URL(input.url);
}

function requestHeadersFrom(input: RequestInfo | URL, init?: RequestInit): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      headers[key] = value;
    });
  }
  assignOutgoingHeaders(headers, init?.headers);
  return headers;
}

function assignOutgoingHeaders(target: http.OutgoingHttpHeaders, headers?: HeadersInit): void {
  if (!headers) {
    return;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      target[key] = value;
    });
    return;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      target[key] = value;
    }
    return;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) {
      target[key] = value;
    }
  }
}

async function requestBodyFrom(input: RequestInfo | URL, init?: RequestInit): Promise<Buffer | undefined> {
  if (init?.body != null) {
    return bodyToBuffer(init.body);
  }
  if (input instanceof Request && input.method !== "GET" && input.method !== "HEAD") {
    const bytes = await input.arrayBuffer();
    return bytes.byteLength > 0 ? Buffer.from(bytes) : undefined;
  }
  return undefined;
}

async function bodyToBuffer(body: BodyInit): Promise<Buffer> {
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return Buffer.from(body.toString());
  }
  const bytes = await new Response(body).arrayBuffer();
  return Buffer.from(bytes);
}

function incomingToHeaders(res: IncomingMessage, stripContentEncoding = false): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }
  if (stripContentEncoding) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return headers;
}

/** Node http does not decode Content-Encoding; browser fetch does. */
function decoderForContentEncoding(res: IncomingMessage): ContentDecoder | undefined {
  const raw = res.headers["content-encoding"];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.split(",")[0]?.trim().toLowerCase();
  if (value === "gzip" || value === "x-gzip") {
    return zlib.createGunzip();
  }
  if (value === "deflate") {
    return zlib.createInflate();
  }
  if (value === "br") {
    return zlib.createBrotliDecompress();
  }
  return undefined;
}

type ContentDecoder = zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress;

/** Fetch forbids a body on 101/204/205/304. Chromium throws; Node's undici too. */
function isNullBodyStatus(status: number): boolean {
  return status === 101 || status === 204 || status === 205 || status === 304;
}

function webResponseBody(res: IncomingMessage, decoder?: ContentDecoder): ReadableStream<Uint8Array> | null {
  if (isNullBodyStatus(res.statusCode ?? 0)) {
    res.resume();
    decoder?.destroy();
    return null;
  }
  return incomingToWebStream(res, decoder);
}

function incomingToWebStream(res: IncomingMessage, decoder?: ContentDecoder): ReadableStream<Uint8Array> {
  let source: NodeJS.ReadableStream = res;
  return new ReadableStream({
    start(controller) {
      if (decoder) {
        res.on("error", (error) => decoder.destroy(error));
        source = decoder;
        attachIncomingStream(decoder, controller, res);
        res.pipe(decoder);
        return;
      }
      attachIncomingStream(res, controller, res);
    },
    cancel() {
      if (source !== res && "destroy" in source) {
        (source as ContentDecoder).destroy();
      }
      res.destroy();
    },
  });
}

function attachIncomingStream(
  source: NodeJS.ReadableStream,
  controller: ReadableStreamDefaultController<Uint8Array>,
  res: IncomingMessage,
): void {
  source.on("data", (chunk: Buffer | string) => {
    try {
      controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk));
    } catch {
      res.destroy();
    }
  });
  source.on("end", () => {
    try {
      controller.close();
    } catch {
      // Already closed after cancel or error.
    }
  });
  source.on("error", (error) => {
    try {
      controller.error(error);
    } catch {
      // Already closed.
    }
  });
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason as unknown;
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error(typeof reason === "string" ? reason : "This operation was aborted");
  error.name = "AbortError";
  return error;
}
