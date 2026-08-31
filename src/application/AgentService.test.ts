import { describe, expect, it } from "vitest";
import { FakeAgentEngine } from "../infrastructure/fake/FakeAgentEngine";
import type { PidianSession, SessionRepository, SessionSummary } from "../domain/sessions/PidianSession";
import { AgentService } from "./AgentService";
import { ContextService } from "./ContextService";
import { SessionService } from "./SessionService";

class MemoryRepository implements SessionRepository {
  readonly sessions: PidianSession[] = [];

  async save(session: PidianSession): Promise<void> {
    const index = this.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) {
      this.sessions[index] = session;
    } else {
      this.sessions.push(session);
    }
  }

  async load(id: string): Promise<PidianSession | undefined> {
    return this.sessions.find((session) => session.id === id);
  }

  async list(): Promise<SessionSummary[]> {
    return this.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      model: session.model,
      provider: session.provider,
    }));
  }

  async delete(id: string): Promise<void> {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index >= 0) {
      this.sessions.splice(index, 1);
    }
  }
}

function createService(store: MemoryRepository): AgentService {
  return new AgentService(
    new FakeAgentEngine(),
    new SessionService(store),
    new ContextService({ getActiveNote: () => undefined }),
    () => [],
  );
}

describe("AgentService.forkFrom", () => {
  it("switches to a new session that keeps history up to the selected message", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("first");
    await agent.send("second");

    const original = agent.getSession();
    expect(original?.messages).toHaveLength(4);
    const firstAssistant = original?.messages[1];
    expect(firstAssistant?.role).toBe("assistant");

    const forked = await agent.forkFrom(firstAssistant!.id);
    const current = agent.getSession();

    expect(current?.id).toBe(forked.id);
    expect(current?.id).not.toBe(original!.id);
    expect(current?.forkedMessageCount).toBe(2);
    expect(current?.messages).toHaveLength(2);
    expect(current?.messages.map((message) => message.text)).toEqual([
      "first",
      expect.stringContaining("first"),
    ]);
    expect(store.sessions.some((session) => session.id === original!.id)).toBe(true);
    expect(store.sessions.some((session) => session.id === forked.id)).toBe(true);
  });

  it("keeps the fork boundary after the conversation continues", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("first");
    await agent.send("second");
    const firstAssistant = agent.getSession()?.messages[1];
    await agent.forkFrom(firstAssistant!.id);
    await agent.send("third");

    const current = agent.getSession();
    expect(current?.forkedMessageCount).toBe(2);
    expect(current?.messages).toHaveLength(4);
  });

  it("leaves the original session intact when the message id is unknown", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");
    const originalId = agent.getSession()?.id;

    await expect(agent.forkFrom("missing")).rejects.toThrow(/Message not found/);
    expect(agent.getSession()?.id).toBe(originalId);
  });
});

describe("AgentService.send", () => {
  it("records how long the assistant worked", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    const assistant = agent.getSession()?.messages[1];
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.workedMs).toEqual(expect.any(Number));
    expect(assistant!.workedMs).toBeGreaterThanOrEqual(0);
  });
});
