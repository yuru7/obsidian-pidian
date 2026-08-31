import { createRequire } from "node:module";
import {
  BlockedUrlError,
  FetchFailedError,
  FetchTimeoutError,
  InvalidUrlError,
  ResponseTooLargeError,
} from "../../domain/fetch/FetchErrors";
import {
  BROWSER_FETCH_TIMEOUT_MS,
  BROWSER_POST_LOAD_WAIT_MS,
  BROWSER_STABILITY_CHECKS,
  BROWSER_STABILITY_INTERVAL_MS,
  FETCH_MAX_BYTES,
  type FetchedDocument,
} from "../../domain/fetch/FetchResult";
import { abortAfter, abortError, rejectWhenAborted, sleep } from "./abortAfter";
import { parseHttpUrl, SsrfGuard } from "./ssrfGuard";

const SNAPSHOT_SCRIPT =
  "(() => { const body = document.body; const text = body ? String(body.innerText || '').trim() : ''; return { textLength: text.length, nodeCount: document.getElementsByTagName('*').length }; })()";
const HTML_SCRIPT = "document.documentElement.outerHTML";

export interface HiddenBrowserWindow {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getStatus(): number;
  executeJavaScript(code: string): Promise<unknown>;
  destroy(): void;
}

export type CreateHiddenBrowserWindow = (input: {
  assertSafe: (url: string) => Promise<URL>;
}) => HiddenBrowserWindow;

export class BrowserFetcher {
  constructor(
    private readonly guard: SsrfGuard,
    private readonly createWindow: CreateHiddenBrowserWindow = createElectronBrowserWindow,
    private readonly limits: {
      timeoutMs?: number;
      postLoadWaitMs?: number;
      stabilityIntervalMs?: number;
      stabilityChecks?: number;
      maxBytes?: number;
    } = {},
  ) {}

  async fetch(url: string, signal?: AbortSignal): Promise<FetchedDocument> {
    const safeUrl = await this.guard.assertSafe(url);
    const timeoutMs = this.limits.timeoutMs ?? BROWSER_FETCH_TIMEOUT_MS;
    const timeout = abortAfter(timeoutMs, signal);
    const window = this.createWindow({ assertSafe: (next) => this.guard.assertSafe(next) });
    try {
      return await this.load(safeUrl.href, window, timeout.signal);
    } catch (error) {
      if (
        error instanceof InvalidUrlError ||
        error instanceof BlockedUrlError ||
        error instanceof FetchTimeoutError ||
        error instanceof ResponseTooLargeError ||
        error instanceof FetchFailedError
      ) {
        throw error;
      }
      if (timeout.signal.aborted && !signal?.aborted) {
        throw new FetchTimeoutError();
      }
      throw new FetchFailedError(error instanceof Error ? error.message : String(error));
    } finally {
      timeout.dispose();
      window.destroy();
    }
  }

  private async load(
    url: string,
    browser: HiddenBrowserWindow,
    signal: AbortSignal,
  ): Promise<FetchedDocument> {
    if (signal.aborted) {
      throw abortError(signal);
    }
    await Promise.race([browser.loadURL(url), rejectWhenAborted(signal)]);
    await sleep(this.limits.postLoadWaitMs ?? BROWSER_POST_LOAD_WAIT_MS, signal);
    await waitUntilStable(browser, {
      signal,
      intervalMs: this.limits.stabilityIntervalMs ?? BROWSER_STABILITY_INTERVAL_MS,
      checks: this.limits.stabilityChecks ?? BROWSER_STABILITY_CHECKS,
    });
    const html = await Promise.race([browser.executeJavaScript(HTML_SCRIPT), rejectWhenAborted(signal)]);
    if (typeof html !== "string" || !html) {
      throw new FetchFailedError("Browser rendering returned no HTML.");
    }
    const maxBytes = this.limits.maxBytes ?? FETCH_MAX_BYTES;
    if (html.length > maxBytes) {
      throw new ResponseTooLargeError();
    }
    const finalUrl = browser.getURL() || url;
    await this.guard.assertSafe(finalUrl);
    return {
      url,
      finalUrl,
      status: browser.getStatus() || 200,
      contentType: "text/html",
      body: html,
      source: "browser",
    };
  }
}

export async function waitUntilStable(
  browser: HiddenBrowserWindow,
  options: { signal: AbortSignal; intervalMs: number; checks: number },
): Promise<void> {
  let previous: string | undefined;
  for (let i = 0; i < options.checks; i++) {
    const snapshot = await Promise.race([
      browser.executeJavaScript(SNAPSHOT_SCRIPT),
      rejectWhenAborted(options.signal),
    ]);
    const key = snapshotKey(snapshot);
    if (previous !== undefined && previous === key) {
      return;
    }
    previous = key;
    if (i < options.checks - 1) {
      await sleep(options.intervalMs, options.signal);
    }
  }
}

/**
 * Obsidian has no public API for a hidden Chromium session. Desktop plugins run in
 * the renderer and create BrowserWindow through Electron (`remote` on older builds).
 * Compatibility risk: Electron/Obsidian upgrades can move or drop `remote`.
 */
export function createElectronBrowserWindow(input: {
  assertSafe: (url: string) => Promise<URL>;
}): HiddenBrowserWindow {
  const BrowserWindow = loadBrowserWindowCtor();
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition: "pidian-fetch",
    },
  });
  const contents = win.webContents;
  let mainStatus = 0;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  contents.session.webRequest.onBeforeRequest?.({ urls: ["*://*/*"] }, (details, callback) => {
    if (details.resourceType !== "mainFrame") {
      callback({});
      return;
    }
    void input.assertSafe(details.url).then(
      () => callback({}),
      () => callback({ cancel: true }),
    );
  });
  contents.session.webRequest.onCompleted({ urls: ["*://*/*"] }, (details) => {
    if (details.resourceType === "mainFrame") {
      mainStatus = details.statusCode;
    }
  });
  const denyNonHttp = (...args: unknown[]) => {
    const event = args[0] as { preventDefault?: () => void } | undefined;
    const navigationUrl = args[1];
    if (typeof navigationUrl !== "string") {
      return;
    }
    try {
      parseHttpUrl(navigationUrl);
    } catch {
      event?.preventDefault?.();
    }
  };
  contents.on("will-navigate", denyNonHttp);
  contents.on("will-redirect", denyNonHttp);
  return {
    loadURL: (url) => win.loadURL(url),
    getURL: () => contents.getURL(),
    getStatus: () => mainStatus,
    executeJavaScript: (code) => contents.executeJavaScript(code),
    destroy: () => {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    },
  };
}

function snapshotKey(snapshot: unknown): string {
  if (typeof snapshot !== "object" || snapshot === null) {
    return String(snapshot);
  }
  const record = snapshot as { textLength?: unknown; nodeCount?: unknown };
  return `${String(record.textLength ?? "")}:${String(record.nodeCount ?? "")}`;
}

interface ElectronBrowserWindow {
  loadURL(url: string): Promise<void>;
  destroy(): void;
  isDestroyed(): boolean;
  webContents: {
    getURL(): string;
    executeJavaScript(code: string): Promise<unknown>;
    setWindowOpenHandler(handler: () => { action: "allow" | "deny" }): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    session: {
      setPermissionRequestHandler(
        handler: (
          webContents: unknown,
          permission: string,
          callback: (allow: boolean) => void,
        ) => void,
      ): void;
      webRequest: {
        onBeforeRequest?(
          filter: { urls: string[] },
          listener: (
            details: { url: string; resourceType: string },
            callback: (response: { cancel?: boolean }) => void,
          ) => void,
        ): void;
        onCompleted(
          filter: { urls: string[] },
          listener: (details: { url: string; resourceType: string; statusCode: number }) => void,
        ): void;
      };
    };
  };
}

type BrowserWindowCtor = new (options: Record<string, unknown>) => ElectronBrowserWindow;

function loadBrowserWindowCtor(): BrowserWindowCtor {
  const electron = createRequire(import.meta.url)("electron") as {
    BrowserWindow?: BrowserWindowCtor;
    remote?: { BrowserWindow?: BrowserWindowCtor };
  };
  const ctor = electron.remote?.BrowserWindow ?? electron.BrowserWindow;
  if (!ctor) {
    throw new FetchFailedError("Browser rendering is unavailable.");
  }
  return ctor;
}
