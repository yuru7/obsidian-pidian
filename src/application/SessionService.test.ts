import { describe, expect, it } from "vitest";
import type { PidianSession, SessionRepository } from "../domain/sessions/PidianSession";
import { formatAgentPrompt } from "./ContextService";
import { SessionService } from "./SessionService";

const unused: SessionRepository = {
  save: async () => undefined,
  load: async () => undefined,
  list: async () => [],
  delete: async () => undefined,
};

function session(overrides?: Partial<PidianSession>): PidianSession {
  return {
    version: 1,
    id: "source",
    title: "Search tools",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:02.000Z",
    provider: "openai",
    model: "gpt-5",
    thinkingLevel: "high",
    messages: [
      { id: "u1", role: "user", text: "search", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a1", role: "assistant", text: "Brave", createdAt: "2026-01-01T00:00:01.000Z" },
      { id: "u2", role: "user", text: "DuckDuckGo", createdAt: "2026-01-01T00:00:02.000Z" },
      { id: "a2", role: "assistant", text: "ok", createdAt: "2026-01-01T00:00:03.000Z" },
    ],
    ...overrides,
  };
}

describe("SessionService.fork", () => {
  it("copies messages up to the selected entry into a new forked session", () => {
    const service = new SessionService(unused);
    const source = session();
    const forked = service.fork(source, "a1");

    expect(forked.id).not.toBe(source.id);
    expect(forked.title).toBe("Search tools");
    expect(forked.provider).toBe("openai");
    expect(forked.model).toBe("gpt-5");
    expect(forked.thinkingLevel).toBe("high");
    expect(forked.forkedMessageCount).toBe(2);
    expect(forked.messages).toEqual(source.messages.slice(0, 2));
    expect(source.messages).toHaveLength(4);
  });

  it("does not share message objects with the source session", () => {
    const service = new SessionService(unused);
    const source = session();
    const forked = service.fork(source, "a1");
    source.messages[1]!.text = "changed";
    expect(forked.messages[1]?.text).toBe("Brave");
  });

  it("rejects an unknown message id", () => {
    const service = new SessionService(unused);
    expect(() => service.fork(session(), "missing")).toThrow(/Message not found/);
  });

  it("copies user message context into the forked session", () => {
    const service = new SessionService(unused);
    const source = session({
      messages: [
        {
          id: "u1",
          role: "user",
          text: "search",
          context: { notePath: "notes/a.md", startLine: 3, endLine: 5 },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        { id: "a1", role: "assistant", text: "ok", createdAt: "2026-01-01T00:00:01.000Z" },
      ],
    });
    const forked = service.fork(source, "a1");
    expect(forked.messages[0]?.context).toEqual({ notePath: "notes/a.md", startLine: 3, endLine: 5 });
    source.messages[0]!.context = { notePath: "changed.md", startLine: 1, endLine: 1 };
    expect(forked.messages[0]?.context).toEqual({ notePath: "notes/a.md", startLine: 3, endLine: 5 });
  });

  it("copies compaction when the kept message is in the forked prefix", () => {
    const service = new SessionService(unused);
    const source = session({
      compaction: {
        summary: "## Goal\nSearch",
        firstKeptMessageId: "a1",
        createdAt: "2026-01-01T00:00:04.000Z",
      },
    });
    const forked = service.fork(source, "a1");
    expect(forked.compaction).toEqual(source.compaction);
    forked.compaction!.summary = "changed";
    expect(source.compaction?.summary).toBe("## Goal\nSearch");
  });

  it("drops compaction when the kept message is after the fork point", () => {
    const service = new SessionService(unused);
    const forked = service.fork(
      session({
        compaction: {
          summary: "## Goal\nSearch",
          firstKeptMessageId: "u2",
          createdAt: "2026-01-01T00:00:04.000Z",
        },
      }),
      "a1",
    );
    expect(forked.compaction).toBeUndefined();
  });
});

describe("SessionService.toConversation", () => {
  it("restores the user prompt envelope from saved context", () => {
    const service = new SessionService(unused);
    const conversation = service.toConversation(
      session({
        messages: [
          {
            id: "u1",
            role: "user",
            text: "rewrite this",
            context: { notePath: "notes/example.md", startLine: 12, endLine: 12 },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { id: "a1", role: "assistant", text: "ok", thinking: "plan", createdAt: "2026-01-01T00:00:01.000Z" },
        ],
      }),
    );

    expect(conversation.messages).toEqual([
      {
        id: "u1",
        role: "user",
        text: formatAgentPrompt("rewrite this", { notePath: "notes/example.md", startLine: 12, endLine: 12 }, "2026-01-01T00:00:00.000Z"),
        thinking: undefined,
        toolCalls: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "a1",
        role: "assistant",
        text: "ok",
        thinking: "plan",
        toolCalls: undefined,
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ]);
  });

  it("labels user text when saved context is missing", () => {
    const service = new SessionService(unused);
    const conversation = service.toConversation(session());
    expect(conversation.messages[0]?.text).toBe(
      formatAgentPrompt("search", undefined, "2026-01-01T00:00:00.000Z"),
    );
    expect(conversation.messages[2]?.text).toBe(
      formatAgentPrompt("DuckDuckGo", undefined, "2026-01-01T00:00:02.000Z"),
    );
    expect(conversation.messages[1]?.text).toBe("Brave");
  });

  it("includes the compaction checkpoint for resume", () => {
    const service = new SessionService(unused);
    const conversation = service.toConversation(
      session({
        compaction: {
          summary: "## Goal\nSearch",
          firstKeptMessageId: "u2",
          createdAt: "2026-01-01T00:00:04.000Z",
          tokensBefore: 40000,
        },
      }),
    );
    expect(conversation.compaction).toEqual({
      summary: "## Goal\nSearch",
      firstKeptMessageId: "u2",
      tokensBefore: 40000,
    });
  });
});

describe("SessionService.truncateBefore", () => {
  it("drops the selected user message and everything after it", () => {
    const service = new SessionService(unused);
    const source = session();
    service.truncateBefore(source, "u2");
    expect(source.messages.map((message) => message.id)).toEqual(["u1", "a1"]);
  });

  it("keeps an empty history when the first user message is edited", () => {
    const service = new SessionService(unused);
    const source = session();
    service.truncateBefore(source, "u1");
    expect(source.messages).toEqual([]);
  });

  it("rejects an unknown message id", () => {
    const service = new SessionService(unused);
    expect(() => service.truncateBefore(session(), "missing")).toThrow(/Message not found/);
  });

  it("rejects assistant messages", () => {
    const service = new SessionService(unused);
    expect(() => service.truncateBefore(session(), "a1")).toThrow(/Only user messages/);
  });

  it("drops compaction when the kept message is no longer in the remaining history", () => {
    const service = new SessionService(unused);
    const source = session({
      compaction: {
        summary: "## Goal\nSearch",
        firstKeptMessageId: "u2",
        createdAt: "2026-01-01T00:00:04.000Z",
      },
    });
    service.truncateBefore(source, "u2");
    expect(source.compaction).toBeUndefined();
  });

  it("keeps compaction when the kept message remains", () => {
    const service = new SessionService(unused);
    const compaction = {
      summary: "## Goal\nSearch",
      firstKeptMessageId: "a1",
      createdAt: "2026-01-01T00:00:04.000Z",
    };
    const source = session({ compaction });
    service.truncateBefore(source, "u2");
    expect(source.compaction).toEqual(compaction);
  });

  it("drops forkedMessageCount when it points past the remaining messages", () => {
    const service = new SessionService(unused);
    const source = session({ forkedMessageCount: 4 });
    service.truncateBefore(source, "u2");
    expect(source.forkedMessageCount).toBeUndefined();
    expect(source.messages).toHaveLength(2);
  });

  it("keeps forkedMessageCount when it still falls inside the remaining messages", () => {
    const service = new SessionService(unused);
    const source = session({ forkedMessageCount: 2 });
    service.truncateBefore(source, "u2");
    expect(source.forkedMessageCount).toBe(2);
  });
});
