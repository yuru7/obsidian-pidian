import type { ModelsStore, ModelsStoreEntry, ModelsStoreOperationOptions } from "@earendil-works/pi-ai";
import { normalizeNotePath } from "../../application/notePath";

export const DYNAMIC_MODELS_FILE_NAME = "dynamicModels.json";
export const DYNAMIC_MODELS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DynamicModelsFile {
  readText(): Promise<string | undefined>;
  writeText(contents: string): Promise<void>;
  mtimeMs(): Promise<number | undefined>;
}

export interface DynamicModelsVaultAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  stat(path: string): Promise<{ mtime: number } | null>;
}

export function dynamicModelsInstallPath(pluginInstallDir: string): string {
  const directory = normalizeNotePath(pluginInstallDir).replace(/\/+$/, "");
  return directory ? `${directory}/${DYNAMIC_MODELS_FILE_NAME}` : DYNAMIC_MODELS_FILE_NAME;
}

/** True when the cache is missing or at least one day old. */
export function shouldRefreshDynamicModels(mtimeMs: number | undefined, now = Date.now()): boolean {
  if (mtimeMs === undefined) {
    return true;
  }
  return now - mtimeMs >= DYNAMIC_MODELS_MAX_AGE_MS;
}

/** JSON file at `{pluginInstallDir}/dynamicModels.json` (e.g. `.obsidian/plugins/pidian`). */
export function createDynamicModelsFile(
  adapter: DynamicModelsVaultAdapter,
  pluginInstallDir: string,
): DynamicModelsFile {
  const filePath = dynamicModelsInstallPath(pluginInstallDir);
  return {
    async readText() {
      if (!(await adapter.exists(filePath))) {
        return undefined;
      }
      return adapter.read(filePath);
    },
    async writeText(contents: string) {
      await adapter.write(filePath, contents);
    },
    async mtimeMs() {
      if (!(await adapter.exists(filePath))) {
        return undefined;
      }
      const stat = await adapter.stat(filePath);
      return stat?.mtime;
    },
  };
}

/**
 * Pi `ModelsStore` that keeps the whole catalog in one JSON file and overwrites
 * that file on every write. Reads hydrate once; later writes replace the file.
 */
export class DynamicModelsStore implements ModelsStore {
  private readonly entries = new Map<string, ModelsStoreEntry>();
  private loaded = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly file: DynamicModelsFile) {}

  async read(providerId: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
    return this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      await this.ensureLoaded();
      options?.signal?.throwIfAborted();
      const entry = this.entries.get(providerId);
      return entry ? structuredClone(entry) : undefined;
    });
  }

  async write(
    providerId: string,
    entry: ModelsStoreEntry,
    options?: ModelsStoreOperationOptions,
  ): Promise<void> {
    await this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      await this.ensureLoaded();
      this.entries.set(providerId, structuredClone(entry));
      await this.persist();
    });
  }

  async delete(providerId: string, options?: ModelsStoreOperationOptions): Promise<void> {
    await this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      await this.ensureLoaded();
      this.entries.delete(providerId);
      await this.persist();
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const text = await this.file.readText();
      for (const [providerId, entry] of parseStore(text).entries()) {
        this.entries.set(providerId, entry);
      }
    } catch (error) {
      console.warn("Pidian: failed to read dynamicModels.json", error);
      this.entries.clear();
    }
  }

  private async persist(): Promise<void> {
    const data: Record<string, ModelsStoreEntry> = {};
    for (const [providerId, entry] of this.entries) {
      data[providerId] = entry;
    }
    await this.file.writeText(JSON.stringify(data, null, 2));
  }
}

function parseStore(text: string | undefined): Map<string, ModelsStoreEntry> {
  const entries = new Map<string, ModelsStoreEntry>();
  if (!text?.trim()) {
    return entries;
  }
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return entries;
  }
  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = parseEntry(value);
    if (entry) {
      entries.set(providerId, entry);
    }
  }
  return entries;
}

function parseEntry(value: unknown): ModelsStoreEntry | undefined {
  if (!value || typeof value !== "object" || !("models" in value) || !Array.isArray(value.models)) {
    return undefined;
  }
  const entry = value as ModelsStoreEntry;
  return structuredClone(entry);
}
