import type { App } from "obsidian";
import { toSessionSummary, type PidianSession, type SessionRepository, type SessionSummary } from "../../domain/sessions/PidianSession";
import { getPluginDirectory, parsePluginDirectory, sessionsDir } from "../../application/notePath";
import {
  isSessionFilePath,
  newSessionFilePath,
  sessionFileExtension,
  sessionIdFromFilePath,
} from "../../application/sessionFilePath";
import { parseSessionFile, serializeSessionFile } from "../../application/sessionSerialization";
import type { SessionFileFormat } from "../../settings/Settings";

export class ObsidianSessionRepository implements SessionRepository {
  constructor(
    private readonly app: App,
    private readonly getSessionFileFormat: () => SessionFileFormat = () => "jsonl",
    private readonly resolvePluginDirectory: () => string = getPluginDirectory,
  ) {}

  async save(session: PidianSession): Promise<void> {
    await this.ensureDir();
    const path = (await this.resolveExistingPath(session.id)) ?? newSessionFilePath(session, this.getSessionFileFormat(), this.pluginDirectory());
    await this.app.vault.adapter.write(
      path,
      serializeSessionFile(session, path.endsWith(".md")),
    );
  }

  async load(id: string): Promise<PidianSession | undefined> {
    const path = await this.resolveExistingPath(id);
    if (!path) {
      return undefined;
    }
    const raw = await this.app.vault.adapter.read(path);
    return parseSessionFile(raw);
  }

  async list(): Promise<SessionSummary[]> {
    const byId = new Map<string, SessionSummary>();
    for (const file of await this.listSessionPaths()) {
      try {
        const raw = await this.app.vault.adapter.read(file);
        const session = parseSessionFile(raw);
        const existing = byId.get(session.id);
        if (!existing || file.endsWith(sessionFileExtension(this.getSessionFileFormat()))) {
          byId.set(session.id, toSessionSummary(session));
        }
      } catch {
        // Skip corrupt session files.
      }
    }
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    for (const path of await this.listSessionPaths()) {
      if (sessionIdFromFilePath(path) === id) {
        await this.app.vault.adapter.remove(path);
      }
    }
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
