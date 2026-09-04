import { describe, expect, it } from "vitest";
import { diffSearchIndexManifest } from "./searchIndexManifest";

describe("diffSearchIndexManifest", () => {
  it("detects added, changed, and removed files from mtime and size", () => {
    const current = new Map([
      ["a.md", { mtime: 2, size: 10 }],
      ["b.md", { mtime: 1, size: 20 }],
      ["c.md", { mtime: 1, size: 3 }],
    ]);
    const indexed = new Map([
      ["a.md", { mtime: 1, size: 10 }],
      ["b.md", { mtime: 1, size: 20 }],
      ["gone.md", { mtime: 1, size: 1 }],
    ]);

    expect(diffSearchIndexManifest(current, indexed)).toEqual({
      added: ["c.md"],
      changed: ["a.md"],
      removed: ["gone.md"],
    });
  });

  it("treats size-only changes as updates", () => {
    const current = new Map([["a.md", { mtime: 1, size: 11 }]]);
    const indexed = new Map([["a.md", { mtime: 1, size: 10 }]]);
    expect(diffSearchIndexManifest(current, indexed)).toEqual({
      added: [],
      changed: ["a.md"],
      removed: [],
    });
  });
});
