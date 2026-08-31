import { describe, expect, it, vi } from "vitest";
import { FetchFailedError } from "../../domain/fetch/FetchErrors";
import { FetchOrchestrator, formatFetchResult } from "./FetchOrchestrator";
import { BrowserFetcher, type HiddenBrowserWindow } from "../../infrastructure/fetch/BrowserFetcher";
import { StaticFetcher } from "../../infrastructure/fetch/StaticFetcher";
import { SsrfGuard } from "../../infrastructure/fetch/ssrfGuard";

const ARTICLE = `${"Pi coding agent documentation. ".repeat(40)}`;
const ARTICLE_HTML = `<!DOCTYPE html><html><head><title>Example</title></head><body><article><h1>Example</h1><p>${ARTICLE}</p></article></body></html>`;
const SPA_HTML = `<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script><script src="/vendor.js"></script></body></html>`;
const RENDERED_HTML = `<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"><article><p>${ARTICLE}</p></article></div><script src="/app.js"></script><script src="/vendor.js"></script></body></html>`;

function publicGuard() {
  return new SsrfGuard(async () => [{ address: "8.8.8.8", family: 4 }]);
}

function unusedBrowser(): BrowserFetcher {
  return new BrowserFetcher(publicGuard(), () => {
    throw new Error("browser should not run");
  });
}

function renderedWindow(): HiddenBrowserWindow {
  return {
    async loadURL(): Promise<void> {
      return;
    },
    getURL(): string {
      return "https://example.com/app";
    },
    getStatus(): number {
      return 200;
    },
    async executeJavaScript(code: string): Promise<unknown> {
      if (code.includes("outerHTML")) {
        return RENDERED_HTML;
      }
      return { textLength: 800, nodeCount: 12 };
    },
    destroy(): void {
      return;
    },
  };
}

describe("FetchOrchestrator", () => {
  it("extracts a static article without opening a browser", async () => {
    const service = new FetchOrchestrator(
      new StaticFetcher(
        async () => new Response(ARTICLE_HTML, { headers: { "content-type": "text/html" } }),
        publicGuard(),
      ),
      unusedBrowser(),
    );
    const result = await service.fetch("https://example.com/article");
    expect(result.extractor).toBe("readability");
    expect(result.title).toBe("Example");
    expect(result.content).toContain("Pi coding agent");
    expect(formatFetchResult(result)).toContain("Title: Example");
  });

  it("falls back to the browser only when static HTML looks JavaScript-rendered", async () => {
    const createWindow = vi.fn(renderedWindow);
    const service = new FetchOrchestrator(
      new StaticFetcher(
        async () => new Response(SPA_HTML, { headers: { "content-type": "text/html" } }),
        publicGuard(),
      ),
      new BrowserFetcher(publicGuard(), createWindow, {
        postLoadWaitMs: 0,
        stabilityIntervalMs: 0,
        stabilityChecks: 1,
      }),
    );
    const result = await service.fetch("https://example.com/app");
    expect(createWindow).toHaveBeenCalledOnce();
    expect(result.extractor).toBe("readability");
    expect(result.content).toContain("Pi coding agent");
    expect(result.content).not.toContain("<script");
    expect(result.content).not.toContain("<div id=\"root\"");
  });

  it("runs ContentExtractor on Chromium HTML instead of returning outerHTML", async () => {
    const extract = vi.fn(async (html: string, _url: string, options?: { alreadyRendered?: boolean }) => {
      if (!options?.alreadyRendered) {
        return { status: "javascript-required" as const };
      }
      expect(html).toContain("<script src=\"/app.js\">");
      return {
        status: "success" as const,
        title: "App",
        content: "Extracted markdown body",
        extractor: "readability" as const,
      };
    });
    const service = new FetchOrchestrator(
      new StaticFetcher(
        async () => new Response(SPA_HTML, { headers: { "content-type": "text/html" } }),
        publicGuard(),
      ),
      new BrowserFetcher(publicGuard(), renderedWindow, {
        postLoadWaitMs: 0,
        stabilityIntervalMs: 0,
        stabilityChecks: 1,
      }),
      extract,
    );
    const result = await service.fetch("https://example.com/app");
    expect(extract).toHaveBeenCalledTimes(2);
    expect(result.content).toBe("Extracted markdown body");
    expect(result.extractor).toBe("readability");
  });

  it("does not open a browser for HTTP errors", async () => {
    const createWindow = vi.fn();
    const service = new FetchOrchestrator(
      new StaticFetcher(async () => new Response("missing", { status: 404 }), publicGuard()),
      new BrowserFetcher(publicGuard(), createWindow),
    );
    await expect(service.fetch("https://example.com/missing")).rejects.toBeInstanceOf(FetchFailedError);
    expect(createWindow).not.toHaveBeenCalled();
  });

  it("returns text without a browser", async () => {
    const service = new FetchOrchestrator(
      new StaticFetcher(
        async () => new Response("hello", { headers: { "content-type": "text/plain" } }),
        publicGuard(),
      ),
      unusedBrowser(),
    );
    await expect(service.fetch("https://example.com/plain")).resolves.toMatchObject({
      content: "hello",
      extractor: "text",
    });
  });
});
