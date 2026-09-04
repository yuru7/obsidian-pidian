import { normalizeNotePath } from "../../application/notePath";
import type { FileFingerprint } from "../../application/searchIndexManifest";

export const SEARCH_INDEX_FILE_NAME = "search-index.json";
export const SEARCH_INDEX_VERSION = 1;

export interface SearchIndexFile {
  readText(): Promise<string | undefined>;
  writeText(contents: string): Promise<void>;
}

export interface SearchIndexVaultAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

export interface PersistedSearchIndex {
  version: number;
  files: Record<string, FileFingerprint>;
  miniSearch: unknown;
}

export function searchIndexInstallPath(pluginInstallDir: string): string {
  const directory = normalizeNotePath(pluginInstallDir).replace(/\/+$/, "");
  return directory ? `${directory}/${SEARCH_INDEX_FILE_NAME}` : SEARCH_INDEX_FILE_NAME;
}

/**
 * JSON file at `{pluginInstallDir}/search-index.json`.
 * Kept next to `data.json` via Adapter, not `saveData()`, so settings stays small
 * and a broken index can be deleted without wiping plugin settings.
 */
export function createSearchIndexFile(adapter: SearchIndexVaultAdapter, pluginInstallDir: string): SearchIndexFile {
  const filePath = searchIndexInstallPath(pluginInstallDir);
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
  };
}

export function parsePersistedSearchIndex(text: string): PersistedSearchIndex | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== SEARCH_INDEX_VERSION) {
    return undefined;
  }
  const files = parseFileMap(record.files);
  if (!files) {
    return undefined;
  }
  if (!record.miniSearch || typeof record.miniSearch !== "object" || Array.isArray(record.miniSearch)) {
    return undefined;
  }
  return {
    version: SEARCH_INDEX_VERSION,
    files,
    miniSearch: record.miniSearch,
  };
}

export function serializePersistedSearchIndex(data: PersistedSearchIndex): string {
  return JSON.stringify({
    version: data.version,
    files: data.files,
    miniSearch: data.miniSearch,
  });
}

function parseFileMap(value: unknown): Record<string, FileFingerprint> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const files: Record<string, FileFingerprint> = {};
  for (const [path, fingerprint] of Object.entries(value as Record<string, unknown>)) {
    if (!fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint)) {
      return undefined;
    }
    const record = fingerprint as Record<string, unknown>;
    if (typeof record.mtime !== "number" || typeof record.size !== "number") {
      return undefined;
    }
    files[path] = { mtime: record.mtime, size: record.size };
  }
  return files;
}
