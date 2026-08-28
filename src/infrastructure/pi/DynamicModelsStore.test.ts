import { describe, expect, it, vi } from "vitest";
import type { ModelsStoreEntry } from "@earendil-works/pi-ai";
import {
  createDynamicModelsFile,
  DYNAMIC_MODELS_MAX_AGE_MS,
  DynamicModelsStore,
  shouldRefreshDynamicModels,
} from "./DynamicModelsStore";

function entry(id: string): ModelsStoreEntry {
  return {
    models: [
      {
        id,
        name: id,
        api: "openai-completions",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
    checkedAt: 1,
  };
}

function memoryFile(initial?: string) {
  let text = initial;
  return {
    readText: async () => text,
    writeText: async (next: string) => {
      text = next;
    },
    mtimeMs: async () => (text === undefined ? undefined : 0),
    contents: () => text,
  };
}

describe("DynamicModelsStore", () => {
  it("hydrates from the cache file and overwrites it on write", async () => {
    const file = memoryFile(JSON.stringify({ openai: entry("gpt-cached") }));
    const store = new DynamicModelsStore(file);

    await expect(store.read("openai")).resolves.toEqual(entry("gpt-cached"));

    await store.write("openai", entry("gpt-new"));
    expect(JSON.parse(file.contents() ?? "")).toEqual({ openai: entry("gpt-new") });
  });

  it("keeps other providers when overwriting one key", async () => {
    const file = memoryFile();
    const store = new DynamicModelsStore(file);
    await Promise.all([store.write("openai", entry("gpt")), store.write("anthropic", entry("claude"))]);
    expect(JSON.parse(file.contents() ?? "")).toEqual({
      openai: entry("gpt"),
      anthropic: entry("claude"),
    });
  });

  it("starts empty when the cache file is invalid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = memoryFile("{not json");
    const store = new DynamicModelsStore(file);
    await expect(store.read("openai")).resolves.toBeUndefined();
    await store.write("openai", entry("gpt"));
    expect(JSON.parse(file.contents() ?? "")).toEqual({ openai: entry("gpt") });
    warn.mockRestore();
  });

  it("deletes a provider and overwrites the file", async () => {
    const file = memoryFile();
    const store = new DynamicModelsStore(file);
    await store.write("openai", entry("gpt"));
    await store.write("anthropic", entry("claude"));
    await store.delete("openai");
    expect(JSON.parse(file.contents() ?? "")).toEqual({ anthropic: entry("claude") });
  });
});

describe("shouldRefreshDynamicModels", () => {
  const now = 1_700_000_000_000;

  it("refreshes when the cache file is missing", () => {
    expect(shouldRefreshDynamicModels(undefined, now)).toBe(true);
  });

  it("keeps a cache younger than one day", () => {
    expect(shouldRefreshDynamicModels(now - DYNAMIC_MODELS_MAX_AGE_MS + 1, now)).toBe(false);
  });

  it("refreshes a cache that is one day old or older", () => {
    expect(shouldRefreshDynamicModels(now - DYNAMIC_MODELS_MAX_AGE_MS, now)).toBe(true);
    expect(shouldRefreshDynamicModels(now - DYNAMIC_MODELS_MAX_AGE_MS - 1, now)).toBe(true);
  });
});

describe("createDynamicModelsFile", () => {
  it("writes dynamicModels.json under the plugin install directory", async () => {
    const files = new Map<string, string>();
    const mtimes = new Map<string, number>();
    const file = createDynamicModelsFile(
      {
        exists: async (path) => files.has(path),
        read: async (path) => {
          const contents = files.get(path);
          if (contents === undefined) {
            throw new Error(`missing ${path}`);
          }
          return contents;
        },
        write: async (path, data) => {
          files.set(path, data);
          mtimes.set(path, 100);
        },
        stat: async (path) => {
          const mtime = mtimes.get(path);
          return mtime === undefined ? null : { mtime };
        },
      },
      ".obsidian/plugins/pidian",
    );

    await expect(file.mtimeMs()).resolves.toBeUndefined();
    await file.writeText('{"openai":{}}');
    expect(files.get(".obsidian/plugins/pidian/dynamicModels.json")).toBe('{"openai":{}}');
    await expect(file.readText()).resolves.toBe('{"openai":{}}');
    await expect(file.mtimeMs()).resolves.toBe(100);
  });
});
