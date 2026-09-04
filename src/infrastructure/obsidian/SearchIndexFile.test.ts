import { describe, expect, it } from "vitest";
import {
  createSearchIndexFile,
  parsePersistedSearchIndex,
  SEARCH_INDEX_FILE_NAME,
  SEARCH_INDEX_VERSION,
  serializePersistedSearchIndex,
} from "./SearchIndexFile";

describe("SearchIndexFile", () => {
  it("writes search-index.json under the plugin install directory", async () => {
    const files = new Map<string, string>();
    const file = createSearchIndexFile(
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
        },
      },
      "config/plugins/pidian",
    );

    await file.writeText("{}");
    expect(files.get(`config/plugins/pidian/${SEARCH_INDEX_FILE_NAME}`)).toBe("{}");
    await expect(file.readText()).resolves.toBe("{}");
  });

  it("rejects a persisted index with the wrong version", () => {
    expect(
      parsePersistedSearchIndex(
        serializePersistedSearchIndex({
          version: SEARCH_INDEX_VERSION + 1,
          files: {},
          miniSearch: { documentCount: 0 },
        }),
      ),
    ).toBeUndefined();
  });
});
