import type { App } from "obsidian";
import type { PidianSession, SessionRepository, SessionSummary } from "../../domain/sessions/PidianSession";
import { SESSIONS_DIR } from "../../application/notePath";
import {
  isSessionFilePath,
  newSessionFilePath,
  SESSION_FILE_EXTENSION,
  sessionIdFromFilePath,
} from "../../application/sessionFilePath";
import { parseSessionFile, serializeSessionFile } from "../../application/sessionSerialization";

export class ObsidianSessionRepository implements SessionRepository {
  constructor(private readonly app: App) {}

  async save(session: PidianSession): Promise<void> {
    await this.ensureDir();
    const path = (await this.resolveExistingPath(session.id)) ?? newSessionFilePath(session);
    await this.app.vault.adapter.write(
      path,
      serializeSessionFile(session, path.endsWith(SESSION_FILE_EXTENSION)),
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
        if (!existing || file.endsWith(SESSION_FILE_EXTENSION)) {
          byId.set(session.id, {
            id: session.id,
            title: session.title,
            updatedAt: session.updatedAt,
            model: session.model,
            provider: session.provider,
          });
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

  private async listSessionPaths(): Promise<string[]> {
    if (!(await this.app.vault.adapter.exists(SESSIONS_DIR))) {
      return [];
    }
    const listed = await this.app.vault.adapter.list(SESSIONS_DIR);
    return listed.files.filter(isSessionFilePath);
  }

  private async resolveExistingPath(id: string): Promise<string | undefined> {
    const matches = (await this.listSessionPaths()).filter((file) => sessionIdFromFilePath(file) === id);
    return matches.find((file) => file.endsWith(SESSION_FILE_EXTENSION)) ?? matches[0];
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.app.vault.adapter.exists("pidian"))) {
      await this.app.vault.adapter.mkdir("pidian");
    }
    if (!(await this.app.vault.adapter.exists(SESSIONS_DIR))) {
      await this.app.vault.adapter.mkdir(SESSIONS_DIR);
    }
  }
}
