import { describe, expect, it } from "vitest";
import { SessionCleanupService, type SessionCleanupOptions } from "./SessionCleanupService";
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

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function cleanupOptions(overrides: Partial<SessionCleanupOptions> = {}): SessionCleanupOptions {
  return {
    retentionEnabled: false,
    retentionDays: 30,
    countLimitEnabled: false,
    maxSessionCount: 5000,
    ...overrides,
  };
}

describe("SessionCleanupService", () => {
  it("does nothing when both auto-delete options are off", async () => {
    const store = [session("old", "2020-01-01T00:00:00.000Z")];
    const service = new SessionCleanupService(new MemorySessions(store));
    await expect(service.cleanup(cleanupOptions())).resolves.toEqual([]);
    expect(store).toHaveLength(1);
  });

  it("deletes expired sessions except the active one", async () => {
    const store = [
      session("old", daysAgo(40)),
      session("active", daysAgo(40)),
      session("fresh", daysAgo(0)),
    ];
    const service = new SessionCleanupService(new MemorySessions(store));
    const deleted = await service.cleanup(
      cleanupOptions({
        retentionEnabled: true,
        retentionDays: 30,
        activeSessionId: "active",
      }),
    );
    expect(deleted).toEqual(["old"]);
    expect(store.map((item) => item.id).sort()).toEqual(["active", "fresh"]);
  });

  it("deletes oldest sessions when the count limit is exceeded", async () => {
    const store = [
      session("oldest", "2020-01-01T00:00:00.000Z"),
      session("middle", "2021-01-01T00:00:00.000Z"),
      session("newest", "2022-01-01T00:00:00.000Z"),
    ];
    const service = new SessionCleanupService(new MemorySessions(store));
    const deleted = await service.cleanup(cleanupOptions({ countLimitEnabled: true, maxSessionCount: 2 }));
    expect(deleted).toEqual(["oldest"]);
    expect(store.map((item) => item.id)).toEqual(["middle", "newest"]);
  });

  it("keeps the active session when trimming to the count limit", async () => {
    const store = [
      session("active", "2020-01-01T00:00:00.000Z"),
      session("b", "2021-01-01T00:00:00.000Z"),
      session("c", "2022-01-01T00:00:00.000Z"),
      session("d", "2023-01-01T00:00:00.000Z"),
    ];
    const service = new SessionCleanupService(new MemorySessions(store));
    const deleted = await service.cleanup(
      cleanupOptions({
        countLimitEnabled: true,
        maxSessionCount: 2,
        activeSessionId: "active",
      }),
    );
    expect(deleted.sort()).toEqual(["b", "c"]);
    expect(store.map((item) => item.id).sort()).toEqual(["active", "d"]);
  });

  it("applies retention and the count limit together", async () => {
    const store = [
      session("expired", daysAgo(40)),
      session("older-kept-by-age", daysAgo(10)),
      session("mid", daysAgo(5)),
      session("newest", daysAgo(0)),
    ];
    const service = new SessionCleanupService(new MemorySessions(store));
    const deleted = await service.cleanup(
      cleanupOptions({
        retentionEnabled: true,
        retentionDays: 30,
        countLimitEnabled: true,
        maxSessionCount: 2,
      }),
    );
    expect(deleted.sort()).toEqual(["expired", "older-kept-by-age"]);
    expect(store.map((item) => item.id).sort()).toEqual(["mid", "newest"]);
  });

  it("rejects a non-positive max session count when the limit is on", async () => {
    const service = new SessionCleanupService(new MemorySessions([]));
    await expect(service.cleanup(cleanupOptions({ countLimitEnabled: true, maxSessionCount: 0 }))).rejects.toThrow(
      "Max session count must be greater than 0.",
    );
  });
});
