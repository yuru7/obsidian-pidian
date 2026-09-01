import type { App } from "obsidian";
import {
  SESSION_LIST_CACHE_LIMIT,
  sessionListSnapshot,
  toSessionSummary,
  type PidianSession,
  type SessionListSnapshot,
  type SessionRepository,
  type SessionSummary,
} from "../../domain/sessions/PidianSession";
import { getPluginDirectory, parsePluginDirectory, sessionsDir } from "../../application/notePath";
import {
  isSessionFilePath,
  newSessionFilePath,
  sessionFileExtension,
  sessionIdFromFilePath,
} from "../../application/sessionFilePath";
import { parseSessionFile, parseSessionSummary, serializeSessionFile } from "../../application/sessionSerialization";
import type { SessionFileFormat } from "../../settings/Settings";

const LIST_READ_CONCURRENCY = 8;

export class ObsidianSessionRepository implements SessionRepository {
  private recent: SessionSummary[] | undefined;
  private totalCount = 0;
  private warmedKey: string | undefined;

  constructor(
    private readonly app: App,
    private readonly getSessionFileFormat: () => SessionFileFormat = () => "jsonl.md",
    private readonly resolvePluginDirectory: () => string = getPluginDirectory,
  ) {}

  async save(session: PidianSession): Promise<void> {
    await this.ensureDir();
    const existingPath = await this.resolveExistingPath(session.id);
    const path = existingPath ?? newSessionFilePath(session, this.getSessionFileFormat(), this.pluginDirectory());
    await this.app.vault.adapter.write(
      path,
      serializeSessionFile(session, path.endsWith(".md")),
    );
    this.discardStaleCache();
    if (!this.recent) {
      return;
    }
    if (!existingPath) {
      this.totalCount += 1;
    }
    this.upsertRecent(toSessionSummary(session));
  }

  async load(id: string): Promise<PidianSession | undefined> {
    const path = await this.resolveExistingPath(id);
    if (!path) {
      return undefined;
    }
    const raw = await this.app.vault.adapter.read(path);
    return parseSessionFile(raw);
  }

  async list(): Promise<SessionListSnapshot> {
    this.discardStaleCache();
    if (!this.recent) {
      await this.warmRecent();
    }
    return sessionListSnapshot(this.recent ?? [], this.totalCount);
  }

  async listAll(): Promise<SessionSummary[]> {
    this.discardStaleCache();
    const paths = await this.preferredSessionPaths();
    const all = await this.readSummaries(paths);
    this.totalCount = paths.length;
    this.recent = all.slice(0, SESSION_LIST_CACHE_LIMIT);
    this.warmedKey = this.cacheKey();
    return all;
  }

  async delete(id: string): Promise<void> {
    let removed = false;
    for (const path of await this.listSessionPaths()) {
      if (sessionIdFromFilePath(path) === id) {
        await this.app.vault.adapter.remove(path);
        removed = true;
      }
    }
    this.discardStaleCache();
    if (!this.recent || !removed) {
      return;
    }
    this.recent = this.recent.filter((session) => session.id !== id);
    this.totalCount = Math.max(0, this.totalCount - 1);
  }

  private async warmRecent(): Promise<void> {
    const paths = await this.preferredSessionPaths();
    this.totalCount = paths.length;
    this.warmedKey = this.cacheKey();
    if (paths.length <= SESSION_LIST_CACHE_LIMIT) {
      this.recent = await this.readSummaries(paths);
      return;
    }
    this.recent = await this.readSummaries(await this.newestPaths(paths, SESSION_LIST_CACHE_LIMIT));
  }

  private upsertRecent(summary: SessionSummary): void {
    const recent = this.recent;
    if (!recent) {
      return;
    }
    const index = recent.findIndex((item) => item.id === summary.id);
    if (index >= 0) {
      recent[index] = summary;
    } else {
      recent.push(summary);
    }
    recent.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (recent.length > SESSION_LIST_CACHE_LIMIT) {
      recent.length = SESSION_LIST_CACHE_LIMIT;
    }
  }

  private async preferredSessionPaths(): Promise<string[]> {
    const preferred = sessionFileExtension(this.getSessionFileFormat());
    const byId = new Map<string, string>();
    for (const file of await this.listSessionPaths()) {
      const id = sessionIdFromFilePath(file);
      if (!id) {
        continue;
      }
      const existing = byId.get(id);
      if (!existing || file.endsWith(preferred)) {
        byId.set(id, file);
      }
    }
    return [...byId.values()];
  }

  private async newestPaths(paths: readonly string[], limit: number): Promise<string[]> {
    const ranked = await mapLimited(paths, LIST_READ_CONCURRENCY, async (path) => {
      try {
        const stat = await this.app.vault.adapter.stat(path);
        return { path, mtime: stat?.mtime ?? 0 };
      } catch {
        return { path, mtime: 0 };
      }
    });
    ranked.sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path));
    return ranked.slice(0, limit).map((item) => item.path);
  }

  private async readSummaries(paths: readonly string[]): Promise<SessionSummary[]> {
    const entries = await mapLimited(paths, LIST_READ_CONCURRENCY, async (file) => {
      try {
        const raw = await this.app.vault.adapter.read(file);
        return parseSessionSummary(raw);
      } catch {
        return undefined;
      }
    });
    return entries
      .filter((entry): entry is SessionSummary => entry !== undefined)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private discardStaleCache(): void {
    if (this.warmedKey !== undefined && this.warmedKey !== this.cacheKey()) {
      this.recent = undefined;
      this.warmedKey = undefined;
      this.totalCount = 0;
    }
  }

  private cacheKey(): string {
    return `${this.sessionsPath()}\0${this.getSessionFileFormat()}`;
  }

  private pluginDirectory(): string {
    return parsePluginDirectory(this.resolvePluginDirectory());
  }

  private sessionsPath(): string {
    return sessionsDir(this.pluginDirectory());
  }

  private async listSessionPaths(): Promise<string[]> {
    const directory = this.sessionsPath();
    if (!(await this.app.vault.adapter.exists(directory))) {
      return [];
    }
    const listed = await this.app.vault.adapter.list(directory);
    return listed.files.filter(isSessionFilePath);
  }

  private async resolveExistingPath(id: string): Promise<string | undefined> {
    const matches = (await this.listSessionPaths()).filter((file) => sessionIdFromFilePath(file) === id);
    const preferred = sessionFileExtension(this.getSessionFileFormat());
    return matches.find((file) => file.endsWith(preferred)) ?? matches[0];
  }

  private async ensureDir(): Promise<void> {
    await this.ensureFolder(this.pluginDirectory());
    await this.ensureFolder(this.sessionsPath());
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }
}

function mapLimited<T, R>(items: readonly T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) {
    return Promise.resolve([]);
  }
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!);
    }
  };
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker())).then(() => results);
}
