import { describe, expect, it } from "vitest";
import { SessionCleanupService } from "./SessionCleanupService";
import { toSessionSummary, type PidianSession, type SessionListSnapshot, type SessionRepository, type SessionSummary } from "../domain/sessions/PidianSession";

class MemorySessions implements SessionRepository {
  constructor(private readonly sessions: PidianSession[]) {}

  async save(session: PidianSession): Promise<void> {
    this.sessions.push(session);
  }

  async load(id: string): Promise<PidianSession | undefined> {
    return this.sessions.find((session) => session.id === id);
  }

  async list(): Promise<SessionListSnapshot> {
    const sessions = this.sessions.map(toSessionSummary);
    return { sessions, totalCount: sessions.length, hasMore: false };
  }

  async listAll(): Promise<SessionSummary[]> {
    return this.sessions.map(toSessionSummary);
  }

  async delete(id: string): Promise<void> {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index >= 0) {
      this.sessions.splice(index, 1);
    }
  }
}

function session(id: string, updatedAt: string): PidianSession {
  return {
    version: 1,
    id,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    provider: "openai",
    model: "gpt-5",
    messages: [],
  };
}

describe("SessionCleanupService", () => {
  it("does nothing when auto-delete is off", async () => {
    const store = [session("old", "2020-01-01T00:00:00.000Z")];
    const service = new SessionCleanupService(new MemorySessions(store));
    await expect(service.cleanup({ enabled: false, retentionDays: 7 })).resolves.toEqual([]);
    expect(store).toHaveLength(1);
  });

  it("deletes expired sessions except the active one", async () => {
    const now = Date.now();
    const store = [
      session("old", new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString()),
      session("active", new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString()),
      session("fresh", new Date(now).toISOString()),
    ];
    const service = new SessionCleanupService(new MemorySessions(store));
    const deleted = await service.cleanup({
      enabled: true,
      retentionDays: 30,
      activeSessionId: "active",
    });
    expect(deleted).toEqual(["old"]);
    expect(store.map((item) => item.id).sort()).toEqual(["active", "fresh"]);
  });
});
