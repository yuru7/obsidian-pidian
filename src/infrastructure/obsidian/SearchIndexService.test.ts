import { describe, expect, it, vi } from "vitest";
import {
  SearchIndexService,
  type SearchIndexHost,
  type SearchIndexNoteMeta,
} from "./SearchIndexService";
import { SEARCH_INDEX_VERSION, type SearchIndexFile } from "./SearchIndexFile";

class MemoryHost implements SearchIndexHost {
  constructor(
    readonly notes: Map<string, { title: string; content: string; mtime: number; size: number }>,
    readonly reads: string[] = [],
  ) {}

  listNotes(): SearchIndexNoteMeta[] {
    return [...this.notes.entries()].map(([path, note]) => ({
      path,
      title: note.title,
      mtime: note.mtime,
      size: note.size,
    }));
  }

  noteMeta(path: string): SearchIndexNoteMeta | undefined {
    const note = this.notes.get(path);
    if (!note) {
      return undefined;
    }
    return { path, title: note.title, mtime: note.mtime, size: note.size };
  }

  async readNote(path: string): Promise<string | undefined> {
    this.reads.push(path);
    return this.notes.get(path)?.content;
  }
}

function memoryFile(initial?: string): SearchIndexFile & { contents: () => string | undefined } {
  let text = initial;
  return {
    readText: async () => text,
    writeText: async (next: string) => {
      text = next;
    },
    contents: () => text,
  };
}

function serviceOf(host: SearchIndexHost, persist: SearchIndexFile): SearchIndexService {
  return new SearchIndexService(host, persist, {
    yieldToEventLoop: async () => undefined,
    persistIdleMs: 60_000,
  });
}

describe("SearchIndexService", () => {
  it("indexes notes once and searches without re-reading unchanged bodies", async () => {
    const host = new MemoryHost(
      new Map([
        ["notes/Hello.md", { title: "Hello", content: "unique-phrase in a body", mtime: 1, size: 10 }],
        ["notes/Other.md", { title: "Other", content: "nope", mtime: 1, size: 4 }],
      ]),
    );
    const persist = memoryFile();
    const service = serviceOf(host, persist);

    await service.initialize();
    expect(host.reads).toEqual(["notes/Hello.md", "notes/Other.md"]);

    host.reads.length = 0;
    const hits = await service.search("unique-phrase");
    expect(hits).toEqual([
      {
        path: "notes/Hello.md",
        matchType: "content",
        snippet: "unique-phrase in a body",
      },
    ]);
    expect(host.reads).toEqual(["notes/Hello.md"]);

    await service.dispose();
  });

  it("reuses a persisted MiniSearch index and only reads changed files", async () => {
    const firstHost = new MemoryHost(
      new Map([["a.md", { title: "A", content: "alpha token", mtime: 1, size: 5 }]]),
    );
    const persist = memoryFile();
    const first = serviceOf(firstHost, persist);
    await first.initialize();
    await first.flush();
    expect(JSON.parse(persist.contents() ?? "{}")).toMatchObject({ version: SEARCH_INDEX_VERSION });

    const secondHost = new MemoryHost(
      new Map([
        ["a.md", { title: "A", content: "alpha token", mtime: 1, size: 5 }],
        ["b.md", { title: "B", content: "beta token", mtime: 2, size: 4 }],
      ]),
    );
    const second = serviceOf(secondHost, persist);
    await second.initialize();
    expect(secondHost.reads).toEqual(["b.md"]);
    expect((await second.search("beta")).map((hit) => hit.path)).toEqual(["b.md"]);
    expect((await second.search("alpha")).map((hit) => hit.path)).toEqual(["a.md"]);

    await first.dispose();
    await second.dispose();
  });

  it("coalesces modify events and updates the document id on rename", async () => {
    vi.useFakeTimers();
    const host = new MemoryHost(
      new Map([["old.md", { title: "Old", content: "before", mtime: 1, size: 6 }]]),
    );
    const service = serviceOf(host, memoryFile());
    await service.initialize();
    host.reads.length = 0;

    host.notes.set("old.md", { title: "Old", content: "after one", mtime: 2, size: 9 });
    service.scheduleUpsert("old.md");
    host.notes.set("old.md", { title: "Old", content: "after two", mtime: 3, size: 9 });
    service.scheduleUpsert("old.md");
    expect(host.reads).toEqual([]);

    await vi.advanceTimersByTimeAsync(750);
    expect(host.reads).toEqual(["old.md"]);
    expect((await service.search("after two")).map((hit) => hit.path)).toEqual(["old.md"]);

    host.notes.delete("old.md");
    host.notes.set("new.md", { title: "New", content: "after two", mtime: 4, size: 9 });
    host.reads.length = 0;
    await service.rename("old.md", "new.md");
    expect(host.reads).toEqual(["new.md"]);
    expect((await service.search("after two")).map((hit) => hit.path)).toEqual(["new.md"]);

    await service.dispose();

    vi.useRealTimers();
  });

  it("labels a title-only Japanese hit as filename, not content", async () => {
    const host = new MemoryHost(
      new Map([
        ["ほげほげ.md", { title: "ほげほげ", content: "nope", mtime: 1, size: 4 }],
        [
          "ほげほげ2.md",
          {
            title: "ほげほげ2",
            content: "朝、目を覚ますとカーテンの隙間から柔らかな光が差し込んでいた。",
            mtime: 1,
            size: 40,
          },
        ],
      ]),
    );
    const service = serviceOf(host, memoryFile());
    await service.initialize();
    host.reads.length = 0;

    const hits = await service.search("ほげほげ");
    expect(hits).toEqual([
      { path: "ほげほげ.md", matchType: "filename", snippet: "ほげほげ.md" },
      { path: "ほげほげ2.md", matchType: "filename", snippet: "ほげほげ2.md" },
    ]);
    expect(host.reads).toEqual([]);

    await service.dispose();
  });
});
