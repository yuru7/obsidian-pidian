import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { corsFreeFetch, injectCorsFreeFetch, withCorsFreeFetch } from "./corsFreeFetch";

function fakeRuntime() {
  return {
    stream: vi.fn(),
    streamSimple: vi.fn(),
    complete: vi.fn(),
    completeSimple: vi.fn(),
    fetchDeferred: vi.fn(),
    cancelDeferred: vi.fn(),
  };
}

describe("injectCorsFreeFetch", () => {
  it("injects fetch into stream methods without replacing an explicit fetch", () => {
    const runtime = fakeRuntime();
    const { stream, streamSimple, completeSimple } = runtime;
    const injected = vi.fn() as unknown as typeof fetch;
    const explicit = vi.fn() as unknown as typeof fetch;
    injectCorsFreeFetch(runtime as unknown as ModelRuntime, injected);

    runtime.streamSimple("model", "context");
    runtime.stream("model", "context", { timeoutMs: 1 });
    runtime.completeSimple("model", "context", { fetch: explicit });

    expect(streamSimple).toHaveBeenCalledWith("model", "context", { fetch: injected });
    expect(stream).toHaveBeenCalledWith("model", "context", {
      timeoutMs: 1,
      fetch: injected,
    });
    expect(completeSimple).toHaveBeenCalledWith("model", "context", { fetch: explicit });
  });

  it("injects fetch into deferred methods", () => {
    const runtime = fakeRuntime();
    const { fetchDeferred, cancelDeferred } = runtime;
    const injected = vi.fn() as unknown as typeof fetch;
    injectCorsFreeFetch(runtime as unknown as ModelRuntime, injected);

    runtime.fetchDeferred("model", "handle");
    runtime.cancelDeferred("model", "handle", { apiKey: "k" });

    expect(fetchDeferred).toHaveBeenCalledWith("model", "handle", { fetch: injected });
    expect(cancelDeferred).toHaveBeenCalledWith("model", "handle", {
      apiKey: "k",
      fetch: injected,
    });
  });
});

describe("withCorsFreeFetch", () => {
  it("swaps global fetch for the callback and restores it afterwards", async () => {
    const original = globalThis.fetch;
    const injected = vi.fn() as unknown as typeof fetch;
    const seen: typeof fetch[] = [];
    await withCorsFreeFetch(async () => {
      seen.push(globalThis.fetch);
      return "ok";
    }, injected);
    expect(seen).toEqual([injected]);
    expect(globalThis.fetch).toBe(original);
  });

  it("restores global fetch when the callback throws", async () => {
    const original = globalThis.fetch;
    const injected = vi.fn() as unknown as typeof fetch;
    await expect(
      withCorsFreeFetch(async () => {
        throw new Error("boom");
      }, injected),
    ).rejects.toThrow("boom");
    expect(globalThis.fetch).toBe(original);
  });
});

describe("corsFreeFetch", () => {
  let server: Server | undefined;
  let origin: string;
  let last: { method?: string; url?: string; headers: IncomingHttpHeaders; body: string };

  afterEach(async () => {
    const closing = server;
    server = undefined;
    if (!closing) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      closing.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function listen(
    handler: (req: {
      method?: string;
      url?: string;
      headers: IncomingHttpHeaders;
      body: string;
    }, res: import("node:http").ServerResponse) => void,
  ): Promise<void> {
    last = { headers: {}, body: "" };
    const listening = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        last = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        };
        handler(last, res);
      });
    });
    server = listening;
    await new Promise<void>((resolve) => {
      listening.listen(0, "127.0.0.1", resolve);
    });
    origin = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
  }

  it("sends Authorization and User-Agent and streams the response body", async () => {
    await listen((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: 1\n\n");
      res.write("data: 2\n\n");
      res.end();
    });

    const response = await corsFreeFetch(`${origin}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
        "User-Agent": "pidian-test",
      },
      body: JSON.stringify({ model: "go" }),
    });

    expect(response.status).toBe(200);
    expect(last.method).toBe("POST");
    expect(last.body).toBe('{"model":"go"}');
    expect(last.headers.authorization).toBe("Bearer test-key");
    expect(last.headers["user-agent"]).toBe("pidian-test");
    expect(await response.text()).toBe("data: 1\n\ndata: 2\n\n");
  });

  it("rejects with AbortError when the signal aborts", async () => {
    await listen(() => undefined);
    const controller = new AbortController();
    const pending = corsFreeFetch(`${origin}/hang`, { method: "POST", signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
