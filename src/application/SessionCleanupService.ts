import type { SessionRepository } from "../domain/sessions/PidianSession";

export interface SessionCleanupOptions {
  enabled: boolean;
  retentionDays: number;
  activeSessionId?: string;
}

export class SessionCleanupService {
  constructor(private readonly repository: SessionRepository) {}

  async cleanup(options: SessionCleanupOptions): Promise<string[]> {
    if (!options.enabled) {
      return [];
    }
    if (options.retentionDays <= 0) {
      throw new Error("Retention days must be greater than 0.");
    }

    const cutoff = Date.now() - options.retentionDays * 24 * 60 * 60 * 1000;
    const deleted: string[] = [];
    const sessions = await this.repository.list();
    for (const session of sessions) {
      if (session.id === options.activeSessionId) {
        continue;
      }
      const updatedAt = Date.parse(session.updatedAt);
      if (Number.isNaN(updatedAt) || updatedAt >= cutoff) {
        continue;
      }
      await this.repository.delete(session.id);
      deleted.push(session.id);
    }
    return deleted;
  }
}
