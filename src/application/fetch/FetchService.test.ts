import { describe, expect, it } from "vitest";
import {
  BlockedUrlError,
  FetchTimeoutError,
  ResponseTooLargeError,
  UnsupportedContentTypeError,
} from "../../domain/fetch/FetchErrors";
import { FETCH_MAX_BYTES } from "../../domain/fetch/FetchResult";
import { SsrfGuard } from "../../infrastructure/fetch/ssrfGuard";
import { FetchService, formatFetchResult } from "./FetchService";

const ARTICLE = `${"Pi coding agent documentation. ".repeat(40)}`;

function allowPublic(fetchFn: typeof fetch, limits?: ConstructorParameters<typeof FetchService>[2]) {
  return new FetchService(
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

describe("FetchService", () => {
  it("returns text, JSON, and XML without HTML extraction", async () => {
    const service = allowPublic(async (input) => {
      const url = String(input);
      if (url.endsWith("/plain")) {
        return jsonResponse("hello", "text/plain");
      }
      if (url.endsWith("/json")) {
        return jsonResponse('{"ok":true}', "application/json");
      }
      if (url.endsWith("/ld")) {
        return jsonResponse('{"@type":"Thing"}', "application/ld+json");
      }
      return jsonResponse("<root/>", "application/xml");
    });

    await expect(service.fetch("https://example.com/plain")).resolves.toMatchObject({
      content: "hello",
      extractor: "text",
    });
    await expect(service.fetch("https://example.com/json")).resolves.toMatchObject({
      content: '{"ok":true}',
      extractor: "text",
    });
    await expect(service.fetch("https://example.com/ld")).resolves.toMatchObject({
      content: '{"@type":"Thing"}',
      extractor: "text",
    });
    await expect(service.fetch("https://example.com/xml")).resolves.toMatchObject({
      content: "<root/>",
      extractor: "text",
    });
  });

  it("extracts HTML with Readability", async () => {
    const html = `<!DOCTYPE html><html><head><title>Example</title></head><body><article><h1>Example</h1><p>${ARTICLE}</p></article></body></html>`;
    const service = allowPublic(async () => jsonResponse(html, "text/html"));
    const result = await service.fetch("https://example.com/article");
    expect(result.extractor).toBe("readability");
    expect(result.title).toBe("Example");
    expect(result.content).toContain("Pi coding agent");
    expect(formatFetchResult(result)).toContain("Title: Example");
    expect(formatFetchResult(result)).toContain("URL: https://example.com/article");
  });

  it("rejects a redirect to a private IP", async () => {
    const service = allowPublic(async (input) => {
      if (String(input) === "https://example.com/go") {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    await expect(service.fetch("https://example.com/go")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("rejects Content-Length over the limit", async () => {
    const service = allowPublic(async () =>
      jsonResponse("ignored", "text/plain", {
        headers: { "content-type": "text/plain", "content-length": String(FETCH_MAX_BYTES + 1) },
      }),
    );
    await expect(service.fetch("https://example.com/huge")).rejects.toBeInstanceOf(ResponseTooLargeError);
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
    const service = allowPublic(
      async () => new Response(body, { status: 200, headers: { "content-type": "text/plain" } }),
      { maxBytes: 5 * 1024 * 1024 },
    );
    await expect(service.fetch("https://example.com/stream")).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("times out when the fetch ignores progress", async () => {
    const service = allowPublic(async (_input, init) => {
      await new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
      throw new Error("unreachable");
    }, { timeoutMs: 20 });
    await expect(service.fetch("https://example.com/slow")).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  it("rejects unsupported content types", async () => {
    const service = allowPublic(async () => jsonResponse("fake", "application/pdf"));
    await expect(service.fetch("https://example.com/file.pdf")).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });
});
