import { describe, expect, it } from "vitest";
import type { AgentEngine, AgentSessionOptions } from "../domain/agent/AgentEngine";
import type { AgentEvent, AgentEventListener } from "../domain/agent/AgentEvent";
import type { AgentSession } from "../domain/agent/AgentSession";
import type { PidianSession, SessionRepository, SessionSummary } from "../domain/sessions/PidianSession";
import { FakeAgentEngine } from "../infrastructure/fake/FakeAgentEngine";
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

class ScriptedAgentEngine implements AgentEngine {
  constructor(private readonly play: (emit: (event: AgentEvent) => void) => Promise<void>) {}

  async createSession(_options: AgentSessionOptions): Promise<AgentSession> {
    const listeners = new Set<AgentEventListener>();
    const emit = (event: AgentEvent): void => {
      for (const listener of listeners) {
        listener(event);
      }
    };
    return {
      prompt: async () => {
        await this.play(emit);
      },
      abort: async () => undefined,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      dispose: async () => {
        listeners.clear();
      },
    };
  }
}

function createService(store: MemoryRepository, engine: AgentEngine = new FakeAgentEngine()): AgentService {
  return new AgentService(
    engine,
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
  it("records workedMs on the first text_delta", async () => {
    const store = new MemoryRepository();
    let agent!: AgentService;
    let workedMsAtFirstText: number | undefined;
    agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "thinking_delta", text: "plan" });
        emit({
          type: "tool_started",
          toolCallId: "1",
          toolName: "read_note",
          args: {},
        });
        expect(agent.getSession()?.messages[1]?.workedMs).toBeUndefined();
        emit({
          type: "tool_completed",
          toolCallId: "1",
          toolName: "read_note",
          result: "ok",
          isError: false,
        });
        expect(agent.getSession()?.messages[1]?.workedMs).toBeUndefined();
        emit({ type: "text_delta", text: "Hi" });
        workedMsAtFirstText = agent.getSession()?.messages[1]?.workedMs;
        emit({ type: "text_delta", text: " there" });
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    expect(workedMsAtFirstText).toEqual(expect.any(Number));
    expect(agent.getSession()?.messages[1]?.workedMs).toBe(workedMsAtFirstText);
  });

  it("records workedMs when the turn ends without text", async () => {
    const store = new MemoryRepository();
    const agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "thinking_delta", text: "plan" });
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    expect(agent.getSession()?.messages[1]?.workedMs).toEqual(expect.any(Number));
  });

  it("starts a new work segment after text when tools continue", async () => {
    const store = new MemoryRepository();
    let agent!: AgentService;
    let blocksAfterPreamble: unknown;
    agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "thinking_delta", text: "plan" });
        emit({ type: "text_delta", text: "I'll look." });
        blocksAfterPreamble = [...(agent.getSession()?.messages[1]?.blocks ?? [])];
        emit({
          type: "tool_started",
          toolCallId: "1",
          toolName: "read_note",
          args: {},
        });
        emit({
          type: "tool_completed",
          toolCallId: "1",
          toolName: "read_note",
          result: "ok",
          isError: false,
        });
        emit({ type: "thinking_delta", text: "more" });
        emit({ type: "text_delta", text: " Done." });
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    expect(blocksAfterPreamble).toEqual([
      expect.objectContaining({ type: "work", thinking: "plan", workedMs: expect.any(Number) }),
      { type: "text", text: "I'll look." },
    ]);

    expect(agent.getSession()?.messages[1]?.blocks).toEqual([
      expect.objectContaining({ type: "work", thinking: "plan", workedMs: expect.any(Number) }),
      { type: "text", text: "I'll look." },
      expect.objectContaining({
        type: "work",
        thinking: "more",
        toolCalls: [{ id: "1", name: "read_note", args: {}, result: "ok", isError: false }],
        workedMs: expect.any(Number),
      }),
      { type: "text", text: " Done." },
    ]);
  });
});
