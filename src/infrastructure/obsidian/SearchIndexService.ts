import type { FileFingerprint } from "../../application/searchIndexManifest";
import { diffSearchIndexManifest } from "../../application/searchIndexManifest";
import { collectSearchHits, NOTE_SEARCH_LIMIT } from "../../application/searchIndexedNotes";
import { isExcludedFromSearch } from "../../application/notePath";
import type { NoteSearchIndex, SearchHit } from "../../domain/notes/NoteSearchIndex";
import { MiniSearchNoteIndex, type IndexedNote } from "./MiniSearchNoteIndex";
import {
  parsePersistedSearchIndex,
  SEARCH_INDEX_VERSION,
  serializePersistedSearchIndex,
  type SearchIndexFile,
} from "./SearchIndexFile";

export const SEARCH_INDEX_UPDATE_DEBOUNCE_MS = 1500;
export const SEARCH_INDEX_PERSIST_IDLE_MS = 45_000;
export const SEARCH_INDEX_CHUNK_SIZE = 100;

export interface SearchIndexNoteMeta {
  path: string;
  title: string;
  mtime: number;
  size: number;
}

export interface SearchIndexHost {
  listNotes(): SearchIndexNoteMeta[];
  noteMeta(path: string): SearchIndexNoteMeta | undefined;
  readNote(path: string): Promise<string | undefined>;
}

export interface SearchIndexServiceOptions {
  updateDebounceMs?: number;
  persistIdleMs?: number;
  chunkSize?: number;
  yieldToEventLoop?: () => Promise<void>;
}

export class SearchIndexService implements NoteSearchIndex {
  private index = MiniSearchNoteIndex.empty();
  private readonly files = new Map<string, FileFingerprint>();
  private readonly pendingUpserts = new Map<string, number>();
  private ready: Promise<void> | undefined;
  private persistTimer: number | undefined;
  private dirty = false;
  private disposed = false;
  private mutation: Promise<void> = Promise.resolve();
  private readonly updateDebounceMs: number;
  private readonly persistIdleMs: number;
  private readonly chunkSize: number;
  private readonly yieldToEventLoop: () => Promise<void>;

  constructor(
    private readonly host: SearchIndexHost,
    private readonly persist: SearchIndexFile,
    options: SearchIndexServiceOptions = {},
  ) {
    this.updateDebounceMs = options.updateDebounceMs ?? SEARCH_INDEX_UPDATE_DEBOUNCE_MS;
    this.persistIdleMs = options.persistIdleMs ?? SEARCH_INDEX_PERSIST_IDLE_MS;
    this.chunkSize = options.chunkSize ?? SEARCH_INDEX_CHUNK_SIZE;
    this.yieldToEventLoop =
      options.yieldToEventLoop ??
      (() =>
        new Promise((resolve) => {
          window.setTimeout(resolve, 0);
        }));
  }

  initialize(): Promise<void> {
    this.ready ??= this.enqueue(() => this.syncFromVault());
    return this.ready;
  }

  async search(query: string): Promise<SearchHit[]> {
    const needle = query.trim();
    if (!needle) {
      return [];
    }
    await this.initialize();
    await this.mutation;
    const ranked = this.index.search(needle, NOTE_SEARCH_LIMIT).filter((hit) => !isExcludedFromSearch(hit.path));
    return collectSearchHits({
      query: needle,
      paths: [...this.files.keys()].filter((path) => !isExcludedFromSearch(path)),
      ranked,
      readContent: (path) => this.host.readNote(path),
    });
  }

  scheduleUpsert(path: string): void {
    if (this.disposed) {
      return;
    }
    const existing = this.pendingUpserts.get(path);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      this.pendingUpserts.delete(path);
      void this.runMutation(() => this.upsertNow(path));
    }, this.updateDebounceMs);
    this.pendingUpserts.set(path, timer);
  }

  remove(path: string): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.cancelScheduled(path);
    return this.runMutation(async () => {
      this.removeNow(path);
    });
  }

  removeTree(path: string): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.cancelScheduled(path);
    const prefix = `${path}/`;
    for (const pending of [...this.pendingUpserts.keys()]) {
      if (pending.startsWith(prefix)) {
        this.cancelScheduled(pending);
      }
    }
    return this.runMutation(async () => {
      this.removeNow(path);
      for (const indexed of [...this.files.keys()]) {
        if (indexed.startsWith(prefix)) {
          this.removeNow(indexed);
        }
      }
    });
  }

  rename(oldPath: string, newPath: string): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.cancelScheduled(oldPath);
    this.cancelScheduled(newPath);
    return this.runMutation(async () => {
      this.removeNow(oldPath);
      if (this.host.noteMeta(newPath)) {
        await this.upsertNow(newPath);
      }
    });
  }

  resync(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    return this.runMutation(() => this.applyDiff(this.currentNotes()));
  }

  async flush(): Promise<void> {
    this.clearPersistTimer();
    await this.enqueue(() => this.persistIfDirty());
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.clearDebounces();
    await this.flush();
  }

  private async syncFromVault(): Promise<void> {
    const current = this.currentNotes();
    const persisted = await this.loadPersisted();
    if (persisted) {
      this.index = persisted.index;
      this.files.clear();
      for (const [path, fingerprint] of persisted.files) {
        this.files.set(path, fingerprint);
      }
      await this.applyDiff(current);
      return;
    }
    this.index = MiniSearchNoteIndex.empty();
    this.files.clear();
    await this.indexNotes([...current.keys()]);
  }

  private async applyDiff(current: Map<string, SearchIndexNoteMeta>): Promise<void> {
    const diff = diffSearchIndexManifest(toFingerprints(current), this.files);
    for (const path of diff.removed) {
      this.removeNow(path);
    }
    await this.indexNotes([...diff.added, ...diff.changed]);
  }

  private async indexNotes(paths: readonly string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += this.chunkSize) {
      if (this.disposed) {
        return;
      }
      const chunk = paths.slice(i, i + this.chunkSize);
      const notes = (
        await Promise.all(
          chunk.map(async (path) => {
            const note = await this.toIndexedNote(path);
            if (!note) {
              return undefined;
            }
            const meta = this.host.noteMeta(path);
            if (meta) {
              this.files.set(path, { mtime: meta.mtime, size: meta.size });
            }
            return note;
          }),
        )
      ).filter((note): note is IndexedNote => note !== undefined);
      if (notes.length > 0) {
        this.index.addAll(notes);
        this.markDirty();
      }
      await this.yieldToEventLoop();
    }
  }

  private async upsertNow(path: string): Promise<void> {
    const note = await this.toIndexedNote(path);
    if (!note) {
      this.removeNow(path);
      return;
    }
    const meta = this.host.noteMeta(path);
    this.index.upsert(note);
    if (meta) {
      this.files.set(path, { mtime: meta.mtime, size: meta.size });
    }
    this.markDirty();
  }

  private removeNow(path: string): void {
    if (!this.files.has(path) && !this.index.has(path)) {
      return;
    }
    this.index.remove(path);
    this.files.delete(path);
    this.markDirty();
  }

  private async toIndexedNote(path: string): Promise<IndexedNote | undefined> {
    const meta = this.host.noteMeta(path);
    if (!meta) {
      return undefined;
    }
    const content = await this.host.readNote(path);
    if (content === undefined) {
      return undefined;
    }
    return {
      id: path,
      path,
      title: meta.title,
      content,
    };
  }

  private currentNotes(): Map<string, SearchIndexNoteMeta> {
    const notes = new Map<string, SearchIndexNoteMeta>();
    for (const note of this.host.listNotes()) {
      notes.set(note.path, note);
    }
    return notes;
  }

  private async runMutation(work: () => Promise<void>): Promise<void> {
    await this.initialize();
    await this.enqueue(work);
  }

  private async loadPersisted(): Promise<{ index: MiniSearchNoteIndex; files: Map<string, FileFingerprint> } | undefined> {
    try {
      const text = await this.persist.readText();
      if (!text) {
        return undefined;
      }
      const parsed = parsePersistedSearchIndex(text);
      if (!parsed) {
        return undefined;
      }
      const index = await MiniSearchNoteIndex.fromJSON(parsed.miniSearch);
      if (!index) {
        return undefined;
      }
      return {
        index,
        files: new Map(Object.entries(parsed.files)),
      };
    } catch (error) {
      console.warn("Pidian: failed to read search-index.json", error);
      return undefined;
    }
  }

  private async persistIfDirty(): Promise<void> {
    if (!this.dirty) {
      return;
    }
    const payload = serializePersistedSearchIndex({
      version: SEARCH_INDEX_VERSION,
      files: Object.fromEntries(this.files),
      miniSearch: this.index.toJSON(),
    });
    try {
      await this.persist.writeText(payload);
      this.dirty = false;
    } catch (error) {
      console.warn("Pidian: failed to write search-index.json", error);
    }
  }

  private markDirty(): void {
    this.dirty = true;
    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.clearPersistTimer();
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = undefined;
      void this.enqueue(() => this.persistIfDirty());
    }, this.persistIdleMs);
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.mutation.then(work, work);
    this.mutation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private cancelScheduled(path: string): void {
    const timer = this.pendingUpserts.get(path);
    if (timer === undefined) {
      return;
    }
    window.clearTimeout(timer);
    this.pendingUpserts.delete(path);
  }

  private clearDebounces(): void {
    for (const timer of this.pendingUpserts.values()) {
      window.clearTimeout(timer);
    }
    this.pendingUpserts.clear();
  }

  private clearPersistTimer(): void {
    if (this.persistTimer === undefined) {
      return;
    }
    window.clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
  }
}

function toFingerprints(notes: Map<string, SearchIndexNoteMeta>): Map<string, FileFingerprint> {
  const fingerprints = new Map<string, FileFingerprint>();
  for (const [path, meta] of notes) {
    fingerprints.set(path, { mtime: meta.mtime, size: meta.size });
  }
  return fingerprints;
}
