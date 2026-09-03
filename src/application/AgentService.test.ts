import { describe, expect, it, vi } from "vitest";
import type { AgentConversation } from "../domain/agent/AgentConversation";
import type { AgentEngine, AgentSessionOptions } from "../domain/agent/AgentEngine";
import type { AgentEvent, AgentEventListener } from "../domain/agent/AgentEvent";
import type { AgentSession } from "../domain/agent/AgentSession";
import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";
import { toSessionSummary, type PidianSession, type SessionListSnapshot, type SessionRepository, type SessionSummary } from "../domain/sessions/PidianSession";
import { FakeAgentEngine } from "../infrastructure/fake/FakeAgentEngine";
import { AgentService, MAX_IN_MEMORY_SESSIONS } from "./AgentService";
import { THINKING_IDLE_MS } from "./assistantContent";
import { ContextService, formatAgentPrompt } from "./ContextService";
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

class CapturingEngine implements AgentEngine {
  lastConversation?: AgentConversation;
  lastPrompt?: string;

  constructor(private readonly inner = new FakeAgentEngine()) {}

  capturedConversation(): AgentConversation | undefined {
    return this.lastConversation;
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    this.lastConversation = options.conversation;
    const session = await this.inner.createSession(options);
    return {
      prompt: async (request) => {
        this.lastPrompt = request.text;
        return session.prompt(request);
      },
      abort: () => session.abort(),
      subscribe: (listener) => session.subscribe(listener),
      dispose: () => session.dispose(),
    };
  }
}

class TrackingEngine implements AgentEngine {
  readonly created: string[] = [];
  readonly disposed: string[] = [];

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    this.created.push(options.sessionId);
    const inner = await new FakeAgentEngine().createSession(options);
    return {
      prompt: (request) => inner.prompt(request),
      abort: () => inner.abort(),
      subscribe: (listener) => inner.subscribe(listener),
      dispose: async () => {
        this.disposed.push(options.sessionId);
        await inner.dispose();
      },
    };
  }
}

function createService(
  store: MemoryRepository,
  engine: AgentEngine = new FakeAgentEngine(),
  getActiveNote: () => ContextSnapshot | undefined = () => undefined,
): AgentService {
  return new AgentService(
    engine,
    new SessionService(store),
    new ContextService({ getActiveNote }),
    () => [],
  );
}

async function fillLive(agent: AgentService): Promise<void> {
  for (let index = 0; index < MAX_IN_MEMORY_SESSIONS; index += 1) {
    await agent.newChat("openai", "gpt-5");
    await agent.send(`other ${index}`);
  }
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

describe("AgentService.editAndResend", () => {
  it("rewinds the same session to the turn before the edited message and resends", async () => {
    const store = new MemoryRepository();
    const engine = new CapturingEngine();
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");
    await agent.send("first");
    await agent.send("second");
    const sessionId = agent.getSession()!.id;
    const secondUser = agent.getSession()!.messages[2]!;

    await agent.editAndResend(secondUser.id, "second edited");

    const current = agent.getSession();
    expect(current?.id).toBe(sessionId);
    expect(current?.messages).toHaveLength(4);
    expect(current?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(current?.messages[0]?.text).toBe("first");
    expect(current?.messages[2]?.text).toBe("second edited");
    expect(current?.messages[2]?.id).not.toBe(secondUser.id);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]?.messages[2]?.text).toBe("second edited");
    expect(engine.lastConversation?.messages.map((message) => message.id)).toEqual([
      current?.messages[0]?.id,
      current?.messages[1]?.id,
    ]);
    expect(engine.lastPrompt).toBe(
      formatAgentPrompt("second edited", undefined, current?.messages[2]?.createdAt),
    );
  });

  it("replaces the whole transcript when the first user message is edited", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("first");
    await agent.send("second");
    const firstUser = agent.getSession()!.messages[0]!;

    await agent.editAndResend(firstUser.id, "first edited");

    const current = agent.getSession();
    expect(current?.messages).toHaveLength(2);
    expect(current?.messages[0]?.text).toBe("first edited");
    expect(current?.title).toBe("first edited");
    expect(store.sessions[0]?.messages).toHaveLength(2);
  });

  it("does not rewind when the replacement text is empty", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("first");
    await agent.send("second");
    const ids = agent.getSession()!.messages.map((message) => message.id);

    await agent.editAndResend(ids[2]!, "   ");

    expect(agent.getSession()?.messages.map((message) => message.id)).toEqual(ids);
  });

  it("rejects assistant messages and unknown ids without changing history", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");
    const ids = agent.getSession()!.messages.map((message) => message.id);

    await expect(agent.editAndResend(ids[1]!, "nope")).rejects.toThrow(/Only user messages/);
    await expect(agent.editAndResend("missing", "nope")).rejects.toThrow(/Message not found/);
    expect(agent.getSession()?.messages.map((message) => message.id)).toEqual(ids);
  });
});

describe("AgentService.send", () => {
  it("stores the active note snapshot on the user message without changing the displayed text", async () => {
    const store = new MemoryRepository();
    const snapshot: ContextSnapshot = { notePath: "notes/example.md", startLine: 3, endLine: 5 };
    const agent = createService(store, new FakeAgentEngine(), () => snapshot);
    await agent.newChat("openai", "gpt-5");
    await agent.send("rewrite this");

    expect(agent.getSession()?.messages[0]).toMatchObject({
      role: "user",
      text: "rewrite this",
      context: snapshot,
    });
  });

  it("omits context when no note is active", async () => {
    const store = new MemoryRepository();
    const agent = createService(store);
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    expect(agent.getSession()?.messages[0]?.context).toBeUndefined();
    expect(agent.getSession()?.messages[0]?.text).toBe("hello");
  });

  it("stores a path-only snapshot when the active file has no cursor", async () => {
    const store = new MemoryRepository();
    const snapshot: ContextSnapshot = { notePath: "img/photo.png" };
    const agent = createService(store, new FakeAgentEngine(), () => snapshot);
    await agent.newChat("openai", "gpt-5");
    await agent.send("what is this");

    expect(agent.getSession()?.messages[0]).toMatchObject({
      role: "user",
      text: "what is this",
      context: snapshot,
    });
  });

  it("sends the timestamp envelope without storing it in the user text", async () => {
    const store = new MemoryRepository();
    const engine = new CapturingEngine();
    const snapshot: ContextSnapshot = { notePath: "notes/example.md", startLine: 12, endLine: 12 };
    const agent = createService(store, engine, () => snapshot);
    await agent.newChat("openai", "gpt-5");
    await agent.send("rewrite this");

    const createdAt = agent.getSession()?.messages[0]?.createdAt;
    expect(agent.getSession()?.messages[0]?.text).toBe("rewrite this");
    expect(engine.lastPrompt).toBe(formatAgentPrompt("rewrite this", snapshot, createdAt));
  });

  it("restores the prompt envelope when the agent session is recreated", async () => {
    const store = new MemoryRepository();
    const engine = new CapturingEngine();
    const snapshot: ContextSnapshot = { notePath: "notes/example.md", startLine: 12, endLine: 12 };
    const agent = createService(store, engine, () => snapshot);
    await agent.newChat("openai", "gpt-5");
    await agent.send("rewrite this");
    const sessionId = agent.getSession()!.id;
    const createdAt = agent.getSession()?.messages[0]?.createdAt;
    await fillLive(agent);

    engine.lastConversation = undefined;
    await agent.openChat(sessionId);
    expect(engine.lastConversation).toBeUndefined();

    await agent.send("again");
    expect(engine.capturedConversation()?.messages[0]?.text).toBe(formatAgentPrompt("rewrite this", snapshot, createdAt));
    expect(engine.capturedConversation()?.messages[1]?.text).toContain("rewrite this");
    expect(agent.getSession()?.messages[0]?.text).toBe("rewrite this");
  });

  it("restores a parsed session without loading it by id", async () => {
    const store = new MemoryRepository();
    const engine = new CapturingEngine();
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");
    await agent.send("from disk");
    const parsed = structuredClone(agent.getSession()!);
    parsed.id = "from-file";
    parsed.title = "Opened from file";

    await agent.newChat("openai", "gpt-5");
    engine.lastConversation = undefined;
    await agent.restoreChat(parsed);

    expect(agent.getSession()?.id).toBe(parsed.id);
    expect(agent.getSession()?.title).toBe("Opened from file");
    expect(engine.lastConversation).toBeUndefined();

    await agent.send("follow up");
    expect(engine.capturedConversation()?.messages[0]?.text).toContain("from disk");
  });

  it("passes the compaction checkpoint when the agent session is recreated", async () => {
    const store = new MemoryRepository();
    const engine = new CapturingEngine();
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");
    const session = agent.getSession()!;
    session.compaction = {
      summary: "## Goal\nGreet",
      firstKeptMessageId: session.messages[0]!.id,
      createdAt: "2026-01-01T00:00:04.000Z",
    };
    await store.save(session);
    await fillLive(agent);

    engine.lastConversation = undefined;
    await agent.openChat(session.id);
    const historyIds = agent.getSession()!.messages.map((message) => message.id);
    await agent.send("again");
    const conversation = engine.capturedConversation();

    expect(conversation?.compaction).toEqual({
      summary: "## Goal\nGreet",
      firstKeptMessageId: session.messages[0]!.id,
    });
    expect(conversation?.messages.map((message) => message.id)).toEqual(historyIds);
  });

  it("records workedMs when thinking ends before text", async () => {
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
        emit({ type: "thinking_end" });
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
        emit({ type: "thinking_end" });
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
        emit({ type: "thinking_end" });
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

  it("keeps Working through think-then-tool-then-think until reply text", async () => {
    const store = new MemoryRepository();
    let agent!: AgentService;
    let workedMsAfterSecondThink: unknown;
    agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "thinking_delta", text: "plan" });
        emit({
          type: "tool_started",
          toolCallId: "1",
          toolName: "web_search",
          args: { query: "q" },
        });
        emit({
          type: "tool_completed",
          toolCallId: "1",
          toolName: "web_search",
          result: "hits",
          isError: false,
        });
        emit({ type: "thinking_end" });
        emit({ type: "thinking_delta", text: "more" });
        const work = agent.getSession()?.messages[1]?.blocks?.[0];
        workedMsAfterSecondThink = work?.type === "work" ? work.workedMs : "missing";
        emit({ type: "thinking_end" });
        emit({ type: "text_delta", text: "Done." });
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    expect(workedMsAfterSecondThink).toBeUndefined();
    expect(agent.getSession()?.messages[1]?.blocks).toEqual([
      expect.objectContaining({
        type: "work",
        thinking: "planmore",
        workedMs: expect.any(Number),
      }),
      { type: "text", text: "Done." },
    ]);
  });

  it("keeps overlapping thinking and text in one work then one reply", async () => {
    const store = new MemoryRepository();
    let agent!: AgentService;
    agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "thinking_start" });
        emit({ type: "thinking_delta", text: "in th" });
        emit({ type: "text_delta", text: "はいは" });
        const assistant = agent.getSession()?.messages[1];
        expect(assistant?.text).toBe("はいは");
        expect(assistant?.blocks).toEqual([
          expect.objectContaining({ type: "work", thinking: "in th" }),
          { type: "text", text: "はいは" },
        ]);
        expect(assistant?.blocks?.[0]?.type === "work" ? assistant.blocks[0].workedMs : "missing").toBeUndefined();
        emit({ type: "thinking_delta", text: "e lazy/good person tone." });
        emit({ type: "thinking_end" });
        emit({ type: "text_delta", text: "い、価格.com" });
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    expect(agent.getSession()?.messages[1]?.blocks).toEqual([
      expect.objectContaining({
        type: "work",
        thinking: "in the lazy/good person tone.",
        workedMs: expect.any(Number),
      }),
      { type: "text", text: "はいはい、価格.com" },
    ]);
  });

  it("closes work after thinking deltas go idle while text is still streaming", async () => {
    vi.useFakeTimers();
    const store = new MemoryRepository();
    let agent!: AgentService;
    try {
      agent = createService(
        store,
        new ScriptedAgentEngine(async (emit) => {
          emit({ type: "thinking_delta", text: "plan" });
          emit({ type: "text_delta", text: "Hi" });
          const assistant = agent.getSession()?.messages[1];
          expect(assistant?.blocks?.[0]?.type === "work" ? assistant.blocks[0].workedMs : "missing").toBeUndefined();
          await vi.advanceTimersByTimeAsync(THINKING_IDLE_MS - 1);
          expect(assistant?.blocks?.[0]?.type === "work" ? assistant.blocks[0].workedMs : "missing").toBeUndefined();
          await vi.advanceTimersByTimeAsync(1);
          expect(assistant?.blocks?.[0]?.type === "work" ? assistant.blocks[0].workedMs : "missing").toEqual(
            expect.any(Number),
          );
          emit({ type: "text_delta", text: " there" });
          emit({ type: "thinking_end" });
        }),
      );
      await agent.newChat("openai", "gpt-5");
      await agent.send("hello");
      expect(agent.getSession()?.messages[1]?.text).toBe("Hi there");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores a compaction checkpoint without dropping chat history", async () => {
    const store = new MemoryRepository();
    const agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "text_delta", text: "Hi" });
        emit({ type: "compaction_start" });
        expect(agent.isCompacting()).toBe(true);
        emit({
          type: "compacted",
          summary: "## Goal\nGreet",
          firstKeptIndex: 0,
          tokensBefore: 24000,
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(store.sessions[0]?.compaction?.summary).toBe("## Goal\nGreet");
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    const current = agent.getSession();
    expect(agent.isCompacting()).toBe(false);
    expect(current?.messages).toHaveLength(2);
    expect(current?.messages[0]?.text).toBe("hello");
    expect(current?.compaction).toMatchObject({
      summary: "## Goal\nGreet",
      firstKeptMessageId: current?.messages[0]?.id,
      tokensBefore: 24000,
    });
    expect(store.sessions[0]?.compaction?.summary).toBe("## Goal\nGreet");
  });

  it("keeps a compaction checkpoint when the cut index is past the chat messages", async () => {
    const store = new MemoryRepository();
    const agent = createService(
      store,
      new ScriptedAgentEngine(async (emit) => {
        emit({ type: "text_delta", text: "Hi" });
        emit({ type: "compacted", summary: "## Goal\nGreet", firstKeptIndex: 99 });
        emit({ type: "turn_completed" });
      }),
    );
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");

    const current = agent.getSession();
    expect(current?.compaction?.firstKeptMessageId).toBe(current?.messages.at(-1)?.id);
    expect(store.sessions[0]?.compaction?.summary).toBe("## Goal\nGreet");
  });
});

describe("AgentService in-memory sessions", () => {
  it("does not create a Pi session until a query is sent", async () => {
    const store = new MemoryRepository();
    const engine = new TrackingEngine();
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");

    expect(engine.created).toEqual([]);
    expect(agent.getSession()?.id).toEqual(expect.any(String));

    await agent.send("hello");
    expect(engine.created).toEqual([agent.getSession()!.id]);
  });

  it("does not create a Pi session when opening a past chat", async () => {
    const store = new MemoryRepository();
    const engine = new TrackingEngine();
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");
    await agent.send("hello");
    const firstId = agent.getSession()!.id;
    await fillLive(agent);

    expect(engine.created).toHaveLength(1 + MAX_IN_MEMORY_SESSIONS);
    const createdAfterFill = engine.created.length;
    await agent.openChat(firstId);
    expect(engine.created).toHaveLength(createdAfterFill);
    expect(agent.getSession()?.id).toBe(firstId);
  });

  it("reuses the live Pi session when a queried chat is opened again", async () => {
    const store = new MemoryRepository();
    const engine = new TrackingEngine();
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");
    await agent.send("first");
    const firstId = agent.getSession()!.id;
    await agent.newChat("openai", "gpt-5");
    await agent.send("second");

    await agent.openChat(firstId);
    const created = engine.created.length;
    await agent.send("again");

    expect(agent.getSession()?.id).toBe(firstId);
    expect(engine.created).toHaveLength(created);
    expect(engine.disposed).toEqual([]);
  });

  it("disposes the least recently queried session when a fourth query arrives", async () => {
    const store = new MemoryRepository();
    const engine = new TrackingEngine();
    const agent = createService(store, engine);
    const ids: string[] = [];
    for (let index = 0; index < MAX_IN_MEMORY_SESSIONS + 1; index += 1) {
      await agent.newChat("openai", "gpt-5");
      await agent.send(`query ${index}`);
      ids.push(agent.getSession()!.id);
    }

    expect(engine.created).toEqual(ids);
    expect(engine.disposed).toEqual([ids[0]]);
    expect(store.sessions.map((session) => session.id)).toEqual(ids);
  });

  it("does not treat opening a chat as a query for LRU order", async () => {
    const store = new MemoryRepository();
    const engine = new TrackingEngine();
    const agent = createService(store, engine);
    const ids: string[] = [];
    for (let index = 0; index < MAX_IN_MEMORY_SESSIONS; index += 1) {
      await agent.newChat("openai", "gpt-5");
      await agent.send(`query ${index}`);
      ids.push(agent.getSession()!.id);
    }

    await agent.openChat(ids[0]!);
    await agent.newChat("openai", "gpt-5");
    await agent.send("fourth");

    expect(engine.disposed).toEqual([ids[0]]);
  });

  it("aborts generation when switching away from a streaming session", async () => {
    const store = new MemoryRepository();
    let release!: () => void;
    let started!: () => void;
    const startedAt = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hang = new Promise<void>((resolve) => {
      release = resolve;
    });
    const aborted: string[] = [];
    const engine: AgentEngine = {
      async createSession(options) {
        return {
          prompt: async () => {
            started();
            await hang;
          },
          abort: async () => {
            aborted.push(options.sessionId);
            release();
          },
          subscribe: () => () => undefined,
          dispose: async () => undefined,
        };
      },
    };
    const agent = createService(store, engine);
    await agent.newChat("openai", "gpt-5");
    const firstId = agent.getSession()!.id;
    const pending = agent.send("hello");
    await startedAt;
    expect(agent.isStreaming()).toBe(true);

    await agent.newChat("openai", "gpt-5");
    await pending;

    expect(aborted).toEqual([firstId]);
    expect(agent.isStreaming()).toBe(false);
    expect(agent.getSession()?.id).not.toBe(firstId);
  });
});
