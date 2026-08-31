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
        role: "user",
        text: formatAgentPrompt("rewrite this", { notePath: "notes/example.md", startLine: 12, endLine: 12 }, "2026-01-01T00:00:00.000Z"),
        thinking: undefined,
        toolCalls: undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
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
});
