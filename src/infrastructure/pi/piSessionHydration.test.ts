import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import type { AgentConversation } from "../../domain/agent/AgentConversation";
import { hydratePiSession, pidianIndexForFirstKept } from "./piSessionHydration";

const model = {
  id: "gpt-5",
  name: "GPT-5",
  api: "openai-completions",
  provider: "openai",
  reasoning: false,
  input: ["text"],
  contextWindow: 128000,
  maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
} as Model<Api>;

function conversation(): AgentConversation {
  return {
    messages: [
      { id: "u1", role: "user", text: "first", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a1", role: "assistant", text: "ok", createdAt: "2026-01-01T00:00:01.000Z" },
      { id: "u2", role: "user", text: "second", createdAt: "2026-01-01T00:00:02.000Z" },
      {
        id: "a2",
        role: "assistant",
        text: "done",
        toolCalls: [{ id: "t1", name: "read_note", args: { path: "a.md" }, result: "hi" }],
        createdAt: "2026-01-01T00:00:03.000Z",
      },
    ],
  };
}

describe("pidianIndexForFirstKept", () => {
  it("counts user and assistant messages and maps tool results to the assistant", () => {
    const entries = [
      { id: "hdr", type: "session" },
      { id: "u1", type: "message", message: { role: "user" } },
      { id: "a1", type: "message", message: { role: "assistant" } },
      { id: "tr", type: "message", message: { role: "toolResult" } },
      { id: "u2", type: "message", message: { role: "user" } },
    ];
    expect(pidianIndexForFirstKept(entries, "u1")).toBe(0);
    expect(pidianIndexForFirstKept(entries, "a1")).toBe(1);
    expect(pidianIndexForFirstKept(entries, "tr")).toBe(1);
    expect(pidianIndexForFirstKept(entries, "u2")).toBe(2);
    expect(pidianIndexForFirstKept(entries, "missing")).toBeUndefined();
  });

  it("folds extra Pi assistant/tool cycles into one Pidian assistant", () => {
    const entries = [
      { id: "u1", type: "message", message: { role: "user" } },
      { id: "a1", type: "message", message: { role: "assistant" } },
      { id: "t1", type: "message", message: { role: "toolResult" } },
      { id: "a1b", type: "message", message: { role: "assistant" } },
      { id: "t2", type: "message", message: { role: "toolResult" } },
      { id: "u2", type: "message", message: { role: "user" } },
      { id: "a2", type: "message", message: { role: "assistant" } },
    ];
    expect(pidianIndexForFirstKept(entries, "a1")).toBe(1);
    expect(pidianIndexForFirstKept(entries, "a1b")).toBe(1);
    expect(pidianIndexForFirstKept(entries, "t2")).toBe(1);
    expect(pidianIndexForFirstKept(entries, "u2")).toBe(2);
    expect(pidianIndexForFirstKept(entries, "a2")).toBe(3);
  });
});

describe("hydratePiSession", () => {
  it("loads the full transcript into SessionManager so later compaction can see it", () => {
    const sessionManager = SessionManager.inMemory();
    hydratePiSession(sessionManager, conversation(), model);

    const roles = sessionManager
      .getBranch()
      .filter((entry) => entry.type === "message")
      .map((entry) => (entry.type === "message" ? entry.message.role : undefined));
    expect(roles).toEqual(["user", "assistant", "user", "assistant", "toolResult"]);
    expect(sessionManager.buildSessionContext().messages).toHaveLength(5);
  });

  it("appends a compaction checkpoint so resume context starts at the kept message", () => {
    const sessionManager = SessionManager.inMemory();
    hydratePiSession(sessionManager, { ...conversation(), compaction: { summary: "## Goal\nSearch", firstKeptMessageId: "u2" } }, model);

    const contextRoles = sessionManager.buildSessionContext().messages.map((message) => message.role);
    expect(contextRoles).toEqual(["compactionSummary", "user", "assistant", "toolResult"]);
    const userText = sessionManager.buildSessionContext().messages.find((message) => message.role === "user");
    expect(JSON.stringify(userText)).toContain("second");
    expect(JSON.stringify(userText)).not.toContain("first");
  });
});
