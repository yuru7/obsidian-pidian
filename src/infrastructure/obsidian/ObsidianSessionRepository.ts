import type { App } from "obsidian";
import type { PidianSession, SessionRepository, SessionSummary } from "../../domain/sessions/PidianSession";
import { SESSIONS_DIR } from "../../application/notePath";
import { parsePidianSession, serializePidianSession } from "../../application/sessionSerialization";

export class ObsidianSessionRepository implements SessionRepository {
  constructor(private readonly app: App) {}

  async save(session: PidianSession): Promise<void> {
    await this.ensureDir();
    await this.app.vault.adapter.write(this.filePath(session.id), serializePidianSession(session));
  }

  async load(id: string): Promise<PidianSession | undefined> {
    const path = this.filePath(id);
    if (!(await this.app.vault.adapter.exists(path))) {
      return undefined;
    }
    const raw = await this.app.vault.adapter.read(path);
    return parsePidianSession(JSON.parse(raw));
  }

  async list(): Promise<SessionSummary[]> {
    if (!(await this.app.vault.adapter.exists(SESSIONS_DIR))) {
      return [];
    }
    const listed = await this.app.vault.adapter.list(SESSIONS_DIR);
    const summaries: SessionSummary[] = [];
    for (const file of listed.files) {
      if (!file.endsWith(".json")) {
        continue;
      }
      try {
        const raw = await this.app.vault.adapter.read(file);
        const session = parsePidianSession(JSON.parse(raw));
        summaries.push({
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
          model: session.model,
          provider: session.provider,
        });
      } catch {
        // Skip corrupt session files.
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    const path = this.filePath(id);
    if (await this.app.vault.adapter.exists(path)) {
      await this.app.vault.adapter.remove(path);
    }
  }

  private filePath(id: string): string {
    return `${SESSIONS_DIR}/${id}.json`;
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
