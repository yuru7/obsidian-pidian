import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { SESSION_LIST_CACHE_LIMIT, type PidianSession } from "../../domain/sessions/PidianSession";
import { sessionsDir } from "../../application/notePath";
import { serializePidianSession, serializeSessionFile } from "../../application/sessionSerialization";
import { ObsidianSessionRepository } from "./ObsidianSessionRepository";

const SESSIONS_DIR = sessionsDir();

class MemoryAdapter {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path) || this.dirs.has(path)) {
      return true;
    }
    const prefix = `${path}/`;
    return [...this.files.keys()].some((file) => file.startsWith(prefix));
  }

  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  inflightReads = 0;
  maxConcurrentReads = 0;
  readCount = 0;
  readonly mtimes = new Map<string, number>();

  async read(path: string): Promise<string> {
    this.readCount += 1;
    this.inflightReads += 1;
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.inflightReads);
    await Promise.resolve();
    this.inflightReads -= 1;
    const data = this.files.get(path);
    if (data === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return data;
  }

  async stat(path: string): Promise<{ type: "file"; ctime: number; mtime: number; size: number } | null> {
    const data = this.files.get(path);
    if (data === undefined) {
      return null;
    }
    return { type: "file", ctime: 0, mtime: this.mtimes.get(path) ?? 0, size: data.length };
  }

  async list(directory: string): Promise<{ files: string[]; folders: string[] }> {
    const prefix = `${directory}/`;
    return {
      files: [...this.files.keys()].filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/")),
      folders: [],
    };
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
}

function appWith(adapter: MemoryAdapter): App {
  return { vault: { adapter } } as unknown as App;
}

function session(id: string, title = id): PidianSession {
  return {
    version: 1,
    id,
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    provider: "openai",
    model: "gpt-5",
    messages: [],
  };
}

describe("ObsidianSessionRepository", () => {
  it("writes new session files as timestamp_id.jsonl without a fence", async () => {
    const adapter = new MemoryAdapter();
    const repository = new ObsidianSessionRepository(appWith(adapter));
    const saved = session("abc", "Hello");

    await repository.save(saved);

    const path = `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.jsonl`;
    expect(adapter.files.get(path)).toBe(serializeSessionFile(saved, false));
    expect(adapter.files.has(`${SESSIONS_DIR}/abc.jsonl.md`)).toBe(false);
  });

  it("writes new session files as timestamp_id.jsonl.md with a json fence when format is jsonl.md", async () => {
    const adapter = new MemoryAdapter();
    const repository = new ObsidianSessionRepository(appWith(adapter), () => "jsonl.md");
    const saved = session("abc", "Hello");

    await repository.save(saved);

    const path = `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.jsonl.md`;
    expect(adapter.files.get(path)).toBe(serializeSessionFile(saved, true));
    expect([...adapter.files.keys()].some((file) => file.endsWith(".jsonl") && !file.endsWith(".jsonl.md"))).toBe(false);
  });

  it("loads timestamped .jsonl.md, id-only .jsonl.md, and legacy .json session files", async () => {
    const adapter = new MemoryAdapter();
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_md.jsonl.md`,
      serializeSessionFile(session("md", "Markdown"), true),
    );
    adapter.files.set(`${SESSIONS_DIR}/plain.jsonl.md`, serializePidianSession(session("plain", "Unfenced")));
    adapter.files.set(`${SESSIONS_DIR}/json.json`, JSON.stringify(session("json", "Legacy"), null, 2));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await expect(repository.load("md")).resolves.toMatchObject({ id: "md", title: "Markdown" });
    await expect(repository.load("plain")).resolves.toMatchObject({ id: "plain", title: "Unfenced" });
    await expect(repository.load("json")).resolves.toMatchObject({ id: "json", title: "Legacy" });
  });

  it("lists both extensions and prefers .jsonl when both exist", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    adapter.files.set(`${SESSIONS_DIR}/both.json`, JSON.stringify(session("both", "Legacy"), null, 2));
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_both.jsonl`,
      serializeSessionFile(session("both", "Plain"), false),
    );
    adapter.files.set(`${SESSIONS_DIR}/legacy.json`, JSON.stringify(session("legacy", "Only JSON"), null, 2));
    adapter.files.set(`${SESSIONS_DIR}/notes.md`, "not a session");
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await expect(repository.list()).resolves.toEqual({
      sessions: [
        expect.objectContaining({ id: "both", title: "Plain", firstQuery: "" }),
        expect.objectContaining({ id: "legacy", title: "Only JSON", firstQuery: "" }),
      ],
      totalCount: 2,
      hasMore: false,
    });
  });

  it("includes the first user query when listing sessions", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    const saved: PidianSession = {
      ...session("abc", "Short title"),
      messages: [
        {
          id: "m1",
          role: "user",
          text: "A long first query\nwith multiple lines",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    adapter.files.set(`${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.jsonl.md`, serializeSessionFile(saved, true));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await expect(repository.list()).resolves.toEqual({
      sessions: [
        expect.objectContaining({
          id: "abc",
          title: "Short title",
          firstQuery: "A long first query\nwith multiple lines",
          provider: "openai",
          model: "gpt-5",
        }),
      ],
      totalCount: 1,
      hasMore: false,
    });
  });

  it("lists a jsonl session even when later message lines are corrupt", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.jsonl`,
      [
        '{"version":1,"id":"abc","title":"Hello","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z","provider":"openai","model":"gpt-5"}',
        '{"id":"m1","role":"user","text":"Hi","createdAt":"2026-01-01T00:00:00.000Z"}',
        "{not json",
      ].join("\n"),
    );
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await expect(repository.list()).resolves.toEqual({
      sessions: [expect.objectContaining({ id: "abc", title: "Hello", firstQuery: "Hi" })],
      totalCount: 1,
      hasMore: false,
    });
  });

  it("reads session files concurrently when listing", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    for (let index = 0; index < 10; index += 1) {
      const id = `s${index}`;
      adapter.files.set(
        `${SESSIONS_DIR}/2026-01-01T000000.000Z_${id}.jsonl`,
        serializeSessionFile(session(id, id), false),
      );
    }
    const repository = new ObsidianSessionRepository(appWith(adapter));

    const page = await repository.list();
    expect(page.sessions).toHaveLength(10);
    expect(adapter.maxConcurrentReads).toBeGreaterThan(1);
  });

  it("caches list results in memory until save or delete", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.jsonl`,
      serializeSessionFile(session("abc", "Hello"), false),
    );
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await repository.list();
    expect(adapter.readCount).toBe(1);
    await expect(repository.list()).resolves.toMatchObject({
      sessions: [expect.objectContaining({ id: "abc", title: "Hello" })],
      totalCount: 1,
      hasMore: false,
    });
    expect(adapter.readCount).toBe(1);

    await repository.save(session("abc", "Updated"));
    await expect(repository.list()).resolves.toMatchObject({
      sessions: [expect.objectContaining({ id: "abc", title: "Updated" })],
    });
    expect(adapter.readCount).toBe(1);

    await repository.save(session("def", "Other"));
    await expect(repository.list()).resolves.toMatchObject({
      sessions: expect.arrayContaining([
        expect.objectContaining({ id: "abc" }),
        expect.objectContaining({ id: "def", title: "Other" }),
      ]),
      totalCount: 2,
    });
    expect(adapter.readCount).toBe(1);
  });

  it("reads only the newest cache window and can list the rest on demand", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    const extra = SESSION_LIST_CACHE_LIMIT + 1;
    for (let index = 0; index < extra; index += 1) {
      const id = `s${index}`;
      const path = `${SESSIONS_DIR}/2026-01-01T000000.000Z_${id}.jsonl`;
      adapter.files.set(path, serializeSessionFile(session(id, id), false));
      adapter.mtimes.set(path, index);
    }
    const repository = new ObsidianSessionRepository(appWith(adapter));

    const page = await repository.list();
    expect(page.sessions).toHaveLength(SESSION_LIST_CACHE_LIMIT);
    expect(page.totalCount).toBe(extra);
    expect(page.hasMore).toBe(true);
    expect(page.sessions.some((item) => item.id === `s${SESSION_LIST_CACHE_LIMIT}`)).toBe(true);
    expect(page.sessions.some((item) => item.id === "s0")).toBe(false);
    expect(adapter.readCount).toBe(SESSION_LIST_CACHE_LIMIT);

    const all = await repository.listAll();
    expect(all).toHaveLength(extra);
    expect(all.some((item) => item.id === "s0")).toBe(true);
    expect((await repository.list()).sessions).toHaveLength(SESSION_LIST_CACHE_LIMIT);
  });

  it("updates an existing .json file in place instead of creating .jsonl.md", async () => {
    const adapter = new MemoryAdapter();
    adapter.files.set(`${SESSIONS_DIR}/abc.json`, JSON.stringify(session("abc", "Old"), null, 2));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await repository.save(session("abc", "Updated"));

    expect(adapter.files.has(`${SESSIONS_DIR}/abc.json`)).toBe(true);
    expect([...adapter.files.keys()].some((path) => path.endsWith(".jsonl.md"))).toBe(false);
    expect(adapter.files.get(`${SESSIONS_DIR}/abc.json`)).toBe(serializeSessionFile(session("abc", "Updated"), false));
    await expect(repository.load("abc")).resolves.toMatchObject({ title: "Updated" });
  });

  it("deletes timestamped .jsonl.md and legacy .json files", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.jsonl.md`,
      serializeSessionFile(session("abc"), true),
    );
    adapter.files.set(`${SESSIONS_DIR}/abc.json`, JSON.stringify(session("abc"), null, 2));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await repository.delete("abc");

    expect(adapter.files.size).toBe(0);
  });

  it("writes session files under a custom nested plugin directory", async () => {
    const adapter = new MemoryAdapter();
    const repository = new ObsidianSessionRepository(appWith(adapter), () => "jsonl.md", () => "AI/pidian");
    const saved = session("abc", "Hello");

    await repository.save(saved);

    expect(adapter.dirs.has("AI")).toBe(true);
    expect(adapter.dirs.has("AI/pidian")).toBe(true);
    expect(adapter.dirs.has("AI/pidian/sessions")).toBe(true);
    const path = "AI/pidian/sessions/2026-01-01T000000.000Z_abc.jsonl.md";
    expect(adapter.files.get(path)).toBe(serializeSessionFile(saved, true));
    await expect(repository.load("abc")).resolves.toMatchObject({ id: "abc", title: "Hello" });
  });
});
