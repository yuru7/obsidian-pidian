import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import type { PidianSession } from "../../domain/sessions/PidianSession";
import { SESSIONS_DIR } from "../../application/notePath";
import { serializePidianSession, serializeSessionFile } from "../../application/sessionSerialization";
import { ObsidianSessionRepository } from "./ObsidianSessionRepository";

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

  async read(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return data;
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
  it("writes new session files as timestamp_id.json.md with a json fence", async () => {
    const adapter = new MemoryAdapter();
    const repository = new ObsidianSessionRepository(appWith(adapter));
    const saved = session("abc", "Hello");

    await repository.save(saved);

    const path = `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.json.md`;
    expect(adapter.files.get(path)).toBe(serializeSessionFile(saved, true));
    expect(adapter.files.has(`${SESSIONS_DIR}/abc.json`)).toBe(false);
  });

  it("loads timestamped .json.md, id-only .json.md, and legacy .json session files", async () => {
    const adapter = new MemoryAdapter();
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_md.json.md`,
      serializeSessionFile(session("md", "Markdown"), true),
    );
    adapter.files.set(`${SESSIONS_DIR}/plain.json.md`, serializePidianSession(session("plain", "Unfenced")));
    adapter.files.set(`${SESSIONS_DIR}/json.json`, serializePidianSession(session("json", "Legacy")));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await expect(repository.load("md")).resolves.toMatchObject({ id: "md", title: "Markdown" });
    await expect(repository.load("plain")).resolves.toMatchObject({ id: "plain", title: "Unfenced" });
    await expect(repository.load("json")).resolves.toMatchObject({ id: "json", title: "Legacy" });
  });

  it("lists both extensions and prefers .json.md when both exist", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    adapter.files.set(`${SESSIONS_DIR}/both.json`, serializePidianSession(session("both", "Legacy")));
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_both.json.md`,
      serializeSessionFile(session("both", "Markdown"), true),
    );
    adapter.files.set(`${SESSIONS_DIR}/legacy.json`, serializePidianSession(session("legacy", "Only JSON")));
    adapter.files.set(`${SESSIONS_DIR}/notes.md`, "not a session");
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ id: "both", title: "Markdown" }),
      expect.objectContaining({ id: "legacy", title: "Only JSON" }),
    ]);
  });

  it("updates an existing .json file in place instead of creating .json.md", async () => {
    const adapter = new MemoryAdapter();
    adapter.files.set(`${SESSIONS_DIR}/abc.json`, serializePidianSession(session("abc", "Old")));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await repository.save(session("abc", "Updated"));

    expect(adapter.files.has(`${SESSIONS_DIR}/abc.json`)).toBe(true);
    expect([...adapter.files.keys()].some((path) => path.endsWith(".json.md"))).toBe(false);
    expect(adapter.files.get(`${SESSIONS_DIR}/abc.json`)).toBe(serializeSessionFile(session("abc", "Updated"), false));
    await expect(repository.load("abc")).resolves.toMatchObject({ title: "Updated" });
  });

  it("deletes timestamped .json.md and legacy .json files", async () => {
    const adapter = new MemoryAdapter();
    adapter.dirs.add(SESSIONS_DIR);
    adapter.files.set(
      `${SESSIONS_DIR}/2026-01-01T000000.000Z_abc.json.md`,
      serializeSessionFile(session("abc"), true),
    );
    adapter.files.set(`${SESSIONS_DIR}/abc.json`, serializePidianSession(session("abc")));
    const repository = new ObsidianSessionRepository(appWith(adapter));

    await repository.delete("abc");

    expect(adapter.files.size).toBe(0);
  });
});
