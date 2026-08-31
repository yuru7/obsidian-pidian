import { describe, expect, it } from "vitest";
import {
  BlockedUrlError,
  FetchFailedError,
  FetchTimeoutError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
} from "../../domain/fetch/FetchErrors";
import { FETCH_MAX_BYTES } from "../../domain/fetch/FetchResult";
import { StaticFetcher } from "./StaticFetcher";
import { SsrfGuard } from "./ssrfGuard";

const ARTICLE = `${"Pi coding agent documentation. ".repeat(40)}`;
const HTML = `<!DOCTYPE html><html><head><title>Example</title></head><body><article><h1>Example</h1><p>${ARTICLE}</p></article></body></html>`;

function allowPublic(fetchFn: typeof fetch, limits?: ConstructorParameters<typeof StaticFetcher>[2]) {
  return new StaticFetcher(
    fetchFn,
    new SsrfGuard(async () => [{ address: "8.8.8.8", family: 4 }]),
    limits,
  );
}

function jsonResponse(body: string, contentType: string, extra?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType, ...(extra?.headers ?? {}) },
    ...extra,
  });
}

describe("StaticFetcher", () => {
  it("returns HTML, text, and JSON without extracting the article", async () => {
    const fetcher = allowPublic(async (input) => {
      const url = String(input);
      if (url.endsWith("/plain")) {
        return jsonResponse("hello", "text/plain");
      }
      if (url.endsWith("/json")) {
        return jsonResponse('{"ok":true}', "application/json");
      }
      return jsonResponse(HTML, "text/html");
    });

    await expect(fetcher.fetch("https://example.com/plain")).resolves.toMatchObject({
      body: "hello",
      contentType: "text/plain",
      source: "static",
      status: 200,
    });
    await expect(fetcher.fetch("https://example.com/json")).resolves.toMatchObject({
      body: '{"ok":true}',
      contentType: "application/json",
    });
    const html = await fetcher.fetch("https://example.com/article");
    expect(html.body).toContain("<article>");
    expect(html.contentType).toBe("text/html");
    expect(html.status).toBe(200);
  });

  it("rejects HTTP errors without treating them as extraction failures", async () => {
    const fetcher = allowPublic(async () => new Response("missing", { status: 404 }));
    await expect(fetcher.fetch("https://example.com/missing")).rejects.toBeInstanceOf(FetchFailedError);
    await expect(fetcher.fetch("https://example.com/missing")).rejects.toThrow("Fetch failed (404).");
  });

  it("returns gzip-decoded HTML when the fetch layer already decompressed it", async () => {
    const fetcher = allowPublic(async () => jsonResponse(HTML, "text/html"));
    const result = await fetcher.fetch("https://example.com/gzip");
    expect(result.body).toContain("Pi coding agent");
    expect(result.body.charCodeAt(0)).not.toBe(0x1f);
  });

  it("rejects a redirect to a private IP", async () => {
    const fetcher = allowPublic(async (input) => {
      if (String(input) === "https://example.com/go") {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    await expect(fetcher.fetch("https://example.com/go")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("rejects Content-Length over the limit", async () => {
    const fetcher = allowPublic(async () =>
      jsonResponse("ignored", "text/plain", {
        headers: { "content-type": "text/plain", "content-length": String(FETCH_MAX_BYTES + 1) },
      }),
    );
    await expect(fetcher.fetch("https://example.com/huge")).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("rejects a stream that exceeds the size limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 6; i++) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    const fetcher = allowPublic(
      async () => new Response(body, { status: 200, headers: { "content-type": "text/plain" } }),
      { maxBytes: 5 * 1024 * 1024 },
    );
    await expect(fetcher.fetch("https://example.com/stream")).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("times out when the fetch ignores progress", async () => {
    const fetcher = allowPublic(async (_input, init) => {
      await new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
      throw new Error("unreachable");
    }, { timeoutMs: 20 });
    await expect(fetcher.fetch("https://example.com/slow")).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  it("rejects unsupported content types", async () => {
    const fetcher = allowPublic(async () => jsonResponse("fake", "application/pdf"));
    await expect(fetcher.fetch("https://example.com/file.pdf")).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });
});
