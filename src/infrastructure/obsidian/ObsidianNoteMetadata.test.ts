import { describe, expect, it, vi } from "vitest";
import type { App, CachedMetadata } from "obsidian";
import { bindConfigDir } from "../../application/notePath";

vi.mock("obsidian", () => {
  class TFile {
    path = "";
    extension = "md";
    basename = "";
  }
  return { TFile };
});

const { TFile } = await import("obsidian");
const { ObsidianNoteMetadata } = await import("./ObsidianNoteMetadata");

bindConfigDir(() => "vault-config");

class VaultFile extends TFile {
  constructor(path: string, extension = "md") {
    super();
    this.path = path;
    this.extension = extension;
    const name = path.slice(path.lastIndexOf("/") + 1);
    this.basename = name.replace(/\.[^.]+$/, "");
  }
}

class BacklinkDict {
  constructor(private readonly items: Record<string, unknown[]>) {}

  keys(): string[] {
    return Object.keys(this.items);
  }

  get(key: string): unknown[] | undefined {
    return this.items[key];
  }
}

function file(path: string, extension = "md"): VaultFile {
  return new VaultFile(path, extension);
}

function loc(line: number) {
  return { start: { line, col: 0, offset: 0 }, end: { line, col: 1, offset: 1 } };
}

function appWith(options: {
  files: Record<string, VaultFile>;
  caches?: Record<string, CachedMetadata | null>;
  resolvedLinks?: Record<string, Record<string, number>>;
  unresolvedLinks?: Record<string, Record<string, number>>;
  resolvedDest?: Record<string, string | null>;
  backlinks?: Record<string, unknown[]>;
  includeBacklinksMethod?: boolean;
}): App {
  const files = options.files;
  const includeBacklinks = options.includeBacklinksMethod ?? options.backlinks !== undefined;
  return {
    vault: {
      getAbstractFileByPath(path: string) {
        return files[path] ?? null;
      },
    },
    metadataCache: {
      resolvedLinks: options.resolvedLinks ?? {},
      unresolvedLinks: options.unresolvedLinks ?? {},
      getFileCache(target: VaultFile) {
        return options.caches?.[target.path] ?? null;
      },
      getFirstLinkpathDest(linkpath: string) {
        const dest = options.resolvedDest?.[linkpath];
        return dest ? (files[dest] ?? null) : null;
      },
      ...(includeBacklinks
        ? {
            getBacklinksForFile() {
              return new BacklinkDict(options.backlinks ?? {});
            },
          }
        : {}),
    },
  } as unknown as App;
}

describe("ObsidianNoteMetadata", () => {
  it("throws when the Markdown path does not exist", async () => {
    const metadata = new ObsidianNoteMetadata(appWith({ files: {} }));
    await expect(metadata.getNoteMetadata("missing.md", ["tags"])).rejects.toThrow("Note not found: missing.md");
  });

  it("maps cache fields and resolved link paths", async () => {
    const target = file("notes/a.md");
    const other = file("notes/Other.md");
    const metadata = new ObsidianNoteMetadata(
      appWith({
        files: { "notes/a.md": target, "notes/Other.md": other },
        resolvedDest: { Other: "notes/Other.md", Missing: null },
        caches: {
          "notes/a.md": {
            frontmatter: { title: "A", aliases: ["Alpha"] },
            tags: [{ tag: "#body", position: loc(3) }],
            headings: [{ heading: "Intro", level: 1, position: loc(4) }],
            links: [
              { link: "Other", original: "[[Other]]", position: loc(6) },
              { link: "Missing", original: "[[Missing]]", position: loc(7) },
            ],
          },
        },
        backlinks: {
          "notes/b.md": [{ link: "A", displayText: "see A", position: loc(1) }],
        },
      }),
    );

    const result = await metadata.getNoteMetadata("notes/a.md", [
      "frontmatter",
      "tags",
      "aliases",
      "headings",
      "links",
      "backlinks",
    ]);
    expect(result).toEqual({
      path: "notes/a.md",
      frontmatter: { title: "A", aliases: ["Alpha"] },
      tags: ["#body"],
      aliases: ["Alpha"],
      headings: [{ heading: "Intro", level: 1, line: 5 }],
      links: [
        { link: "Other", path: "notes/Other.md", line: 7 },
        { link: "Missing", line: 8 },
      ],
      backlinks: [{ link: "A", path: "notes/b.md", displayText: "see A", line: 2 }],
    });
  });

  it("returns empty collections when the cache is missing", async () => {
    const metadata = new ObsidianNoteMetadata(
      appWith({
        files: { "empty.md": file("empty.md") },
        caches: { "empty.md": null },
        backlinks: {},
      }),
    );
    const result = await metadata.getNoteMetadata("empty.md", ["frontmatter", "tags", "links", "backlinks"]);
    expect(result).toEqual({
      path: "empty.md",
      frontmatter: {},
      tags: [],
      links: [],
      backlinks: [],
    });
  });

  it("rebuilds backlinks from resolvedLinks when getBacklinksForFile is missing", async () => {
    const target = file("notes/a.md");
    const source = file("notes/b.md");
    const metadata = new ObsidianNoteMetadata(
      appWith({
        files: { "notes/a.md": target, "notes/b.md": source },
        resolvedDest: { A: "notes/a.md" },
        resolvedLinks: { "notes/b.md": { "notes/a.md": 1 } },
        caches: {
          "notes/a.md": {},
          "notes/b.md": {
            links: [{ link: "A", original: "[[A]]", displayText: "to A", position: loc(2) }],
          },
        },
        includeBacklinksMethod: false,
      }),
    );
    const result = await metadata.getNoteMetadata("notes/a.md", ["backlinks"]);
    expect(result.backlinks).toEqual([{ link: "A", path: "notes/b.md", displayText: "to A", line: 3 }]);
  });

  it("returns vault link maps", async () => {
    const metadata = new ObsidianNoteMetadata(
      appWith({
        files: {},
        resolvedLinks: { "notes/a.md": { "notes/b.md": 2 } },
        unresolvedLinks: { "notes/a.md": { Ghost: 1 } },
      }),
    );
    await expect(
      metadata.getVaultLinks({ fields: ["resolvedLinks", "unresolvedLinks"], limit: 200 }),
    ).resolves.toEqual({
      truncated: false,
      resolvedLinks: [{ path: "notes/a.md", links: { "notes/b.md": 2 } }],
      unresolvedLinks: [{ path: "notes/a.md", links: { Ghost: 1 } }],
    });
  });
});
