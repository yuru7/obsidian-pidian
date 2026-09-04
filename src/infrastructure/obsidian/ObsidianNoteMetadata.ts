import { TFile, type App, type CachedMetadata, type MetadataCache } from "obsidian";
import { assertMarkdownFilePath } from "../../application/noteFile";
import { assertSafeDirectoryPath } from "../../application/notePath";
import {
  buildNoteMetadata,
  buildVaultLinks,
  type CacheRef,
  type NoteCacheInput,
} from "../../application/noteMetadata";
import type {
  NoteMetadata,
  NoteMetadataField,
  NoteMetadataIndex,
  VaultLinks,
  VaultLinksQuery,
} from "../../domain/notes/NoteMetadata";

type BacklinkStore = {
  keys?: () => string[];
  get?: (key: string) => unknown;
  data?: Record<string, unknown>;
};

type MetadataCacheWithBacklinks = MetadataCache & {
  getBacklinksForFile?: (file: TFile) => BacklinkStore | null | undefined;
};

export class ObsidianNoteMetadata implements NoteMetadataIndex {
  constructor(private readonly app: App) {}

  async getNoteMetadata(path: string, fields: NoteMetadataField[]): Promise<NoteMetadata> {
    const normalized = assertMarkdownFilePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${normalized}`);
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const input = cache ? toNoteCacheInput(cache, (link) => this.resolveLink(link, normalized)) : null;
    const backlinks = fields.includes("backlinks") ? this.readBacklinks(file) : [];
    return buildNoteMetadata(normalized, input, backlinks, fields);
  }

  async getVaultLinks(query: VaultLinksQuery): Promise<VaultLinks> {
    const path = query.path === undefined ? undefined : assertSafeDirectoryPath(query.path);
    return buildVaultLinks(
      this.app.metadataCache.resolvedLinks,
      this.app.metadataCache.unresolvedLinks,
      { fields: query.fields, path, limit: query.limit },
    );
  }

  private resolveLink(link: string, sourcePath: string): string | null {
    const dest = this.app.metadataCache.getFirstLinkpathDest(stripSubpath(link), sourcePath);
    return dest instanceof TFile ? dest.path : null;
  }

  private readBacklinks(file: TFile): CacheRef[] {
    const cache = this.app.metadataCache as MetadataCacheWithBacklinks;
    // Public MetadataCache only exposes resolvedLinks counts, not per-link
    // backlink text/line/frontmatter key. getBacklinksForFile is undocumented;
    // its signature and return shape (CustomArrayDict vs plain map) may change.
    const store = cache.getBacklinksForFile?.(file);
    if (store) {
      return refsFromBacklinkStore(store);
    }
    return this.backlinksFromResolvedLinks(file);
  }

  private backlinksFromResolvedLinks(file: TFile): CacheRef[] {
    const refs: CacheRef[] = [];
    for (const [source, destinations] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      const count = destinations[file.path];
      if (!count) {
        continue;
      }
      const sourceFile = this.app.vault.getAbstractFileByPath(source);
      if (!(sourceFile instanceof TFile)) {
        refs.push({ link: file.basename, path: source });
        continue;
      }
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      if (!cache) {
        refs.push({ link: file.basename, path: source });
        continue;
      }
      const matches = [
        ...(cache.links ?? []),
        ...(cache.frontmatterLinks ?? []).map((link) => ({ ...link, position: undefined })),
      ].filter((ref) => this.resolveLink(ref.link, source) === file.path);
      if (matches.length === 0) {
        refs.push({ link: file.basename, path: source });
        continue;
      }
      for (const match of matches) {
        refs.push({
          link: match.link,
          displayText: match.displayText,
          path: source,
          key: "key" in match && typeof match.key === "string" ? match.key : undefined,
          position: match.position,
        });
      }
    }
    return refs;
  }
}

function toNoteCacheInput(cache: CachedMetadata, resolve: (link: string) => string | null): NoteCacheInput {
  return {
    frontmatter: cloneFrontmatter(cache.frontmatter),
    tags: cache.tags,
    headings: cache.headings,
    embeds: cache.embeds?.map((ref) => withResolvedPath(ref, resolve(ref.link))),
    listItems: cache.listItems,
    sections: cache.sections,
    links: cache.links?.map((ref) => withResolvedPath(ref, resolve(ref.link))),
    frontmatterLinks: cache.frontmatterLinks?.map((ref) =>
      withResolvedPath({ link: ref.link, displayText: ref.displayText, key: ref.key }, resolve(ref.link)),
    ),
  };
}

function cloneFrontmatter(frontmatter: CachedMetadata["frontmatter"]): Record<string, unknown> | undefined {
  if (!frontmatter) {
    return undefined;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    copy[key] = value;
  }
  return copy;
}

function withResolvedPath(
  ref: { link: string; displayText?: string; key?: string; position?: { start: { line: number } } },
  path: string | null,
): CacheRef {
  return {
    link: ref.link,
    displayText: ref.displayText,
    key: ref.key,
    position: ref.position,
    path,
  };
}

function refsFromBacklinkStore(store: BacklinkStore): CacheRef[] {
  const refs: CacheRef[] = [];
  forEachSource(store, (sourcePath, items) => {
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as {
        link?: unknown;
        displayText?: unknown;
        key?: unknown;
        position?: { start?: { line?: unknown } };
      };
      if (typeof record.link !== "string") {
        continue;
      }
      const startLine = record.position?.start?.line;
      refs.push({
        link: record.link,
        displayText: typeof record.displayText === "string" ? record.displayText : undefined,
        path: sourcePath,
        key: typeof record.key === "string" ? record.key : undefined,
        position: typeof startLine === "number" ? { start: { line: startLine } } : undefined,
      });
    }
  });
  return refs;
}

function forEachSource(store: BacklinkStore, visit: (sourcePath: string, items: unknown[]) => void): void {
  if (typeof store.keys === "function" && typeof store.get === "function") {
    for (const key of store.keys()) {
      const items = store.get(key);
      if (Array.isArray(items)) {
        visit(key, items);
      }
    }
    return;
  }
  const data = store.data ?? store;
  if (data && typeof data === "object") {
    for (const [key, items] of Object.entries(data)) {
      if (Array.isArray(items)) {
        visit(key, items);
      }
    }
  }
}

function stripSubpath(link: string): string {
  const hash = link.indexOf("#");
  return (hash < 0 ? link : link.slice(0, hash)).trim();
}
