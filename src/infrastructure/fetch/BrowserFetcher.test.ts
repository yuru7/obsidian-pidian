import { describe, expect, it, vi } from "vitest";
import { BlockedUrlError, FetchTimeoutError, InvalidUrlError } from "../../domain/fetch/FetchErrors";
import { BrowserFetcher, waitUntilStable, type HiddenBrowserWindow } from "./BrowserFetcher";
import { SsrfGuard } from "./ssrfGuard";

const RENDERED_HTML = `<!DOCTYPE html><html><body><article>${"Rendered article body. ".repeat(40)}</article></body></html>`;

function publicGuard() {
  return new SsrfGuard(async () => [{ address: "8.8.8.8", family: 4 }]);
}

class FakeWindow implements HiddenBrowserWindow {
  destroyed = false;
  status = 200;
  url = "";
  html = RENDERED_HTML;
  snapshots: Array<{ textLength: number; nodeCount: number }> = [
    { textLength: 10, nodeCount: 4 },
    { textLength: 800, nodeCount: 20 },
    { textLength: 800, nodeCount: 20 },
  ];
  hangLoad = false;
  private snapshotIndex = 0;

  async loadURL(url: string): Promise<void> {
    this.url = url;
    if (this.hangLoad) {
      await new Promise<never>(() => undefined);
    }
  }

  getURL(): string {
    return this.url;
  }

  getStatus(): number {
    return this.status;
  }

  async executeJavaScript(code: string): Promise<unknown> {
    if (code.includes("outerHTML")) {
      return this.html;
    }
    const snapshot = this.snapshots[Math.min(this.snapshotIndex, this.snapshots.length - 1)];
    this.snapshotIndex += 1;
    return snapshot;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe("BrowserFetcher", () => {
  it("returns HTML after JavaScript would have filled the page", async () => {
    const fake = new FakeWindow();
    const fetcher = new BrowserFetcher(publicGuard(), () => fake, {
      postLoadWaitMs: 0,
      stabilityIntervalMs: 0,
    });
    const result = await fetcher.fetch("https://example.com/spa");
    expect(result.source).toBe("browser");
    expect(result.body).toContain("Rendered article body");
    expect(result.finalUrl).toBe("https://example.com/spa");
    expect(fake.destroyed).toBe(true);
  });

  it("destroys the window when loading times out", async () => {
    const fake = new FakeWindow();
    fake.hangLoad = true;
    const fetcher = new BrowserFetcher(publicGuard(), () => fake, { timeoutMs: 20, postLoadWaitMs: 0 });
    await expect(fetcher.fetch("https://example.com/slow")).rejects.toBeInstanceOf(FetchTimeoutError);
    expect(fake.destroyed).toBe(true);
  });

  it("rejects private and localhost URLs before opening a window", async () => {
    const createWindow = vi.fn(() => new FakeWindow());
    const fetcher = new BrowserFetcher(new SsrfGuard(async () => []), createWindow);
    await expect(fetcher.fetch("http://127.0.0.1/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(fetcher.fetch("http://localhost/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(fetcher.fetch("file:///etc/passwd")).rejects.toBeInstanceOf(InvalidUrlError);
    expect(createWindow).not.toHaveBeenCalled();
  });
});

describe("waitUntilStable", () => {
  it("stops once body text and DOM size stop changing", async () => {
    const fake = new FakeWindow();
    const execute = vi.spyOn(fake, "executeJavaScript");
    await waitUntilStable(fake, { signal: new AbortController().signal, intervalMs: 0, checks: 4 });
    expect(execute.mock.calls.length).toBe(3);
  });
});
