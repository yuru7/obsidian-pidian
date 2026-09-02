import type { SessionRepository, SessionSummary } from "../domain/sessions/PidianSession";

export interface SessionCleanupOptions {
  retentionEnabled: boolean;
  retentionDays: number;
  countLimitEnabled: boolean;
  maxSessionCount: number;
  activeSessionId?: string;
}

export class SessionCleanupService {
  constructor(private readonly repository: SessionRepository) {}

  async cleanup(options: SessionCleanupOptions): Promise<string[]> {
    if (!options.retentionEnabled && !options.countLimitEnabled) {
      return [];
    }
    if (options.retentionEnabled && options.retentionDays <= 0) {
      throw new Error("Retention days must be greater than 0.");
    }
    if (options.countLimitEnabled && options.maxSessionCount <= 0) {
      throw new Error("Max session count must be greater than 0.");
    }

    const deleted: string[] = [];
    const remaining: SessionSummary[] = [];
    const cutoff = options.retentionEnabled
      ? Date.now() - options.retentionDays * 24 * 60 * 60 * 1000
      : undefined;

    for (const session of await this.repository.listAll()) {
      if (session.id === options.activeSessionId) {
        remaining.push(session);
        continue;
      }
      if (cutoff !== undefined) {
        const updatedAt = Date.parse(session.updatedAt);
        if (!Number.isNaN(updatedAt) && updatedAt < cutoff) {
          await this.repository.delete(session.id);
          deleted.push(session.id);
          continue;
        }
      }
      remaining.push(session);
    }

    if (!options.countLimitEnabled || remaining.length <= options.maxSessionCount) {
      return deleted;
    }

    const overflow = remaining.length - options.maxSessionCount;
    const oldest = remaining
      .filter((session) => session.id !== options.activeSessionId)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    for (const session of oldest.slice(0, overflow)) {
      await this.repository.delete(session.id);
      deleted.push(session.id);
    }
    return deleted;
  }
}
