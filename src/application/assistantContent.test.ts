import { describe, expect, it } from "vitest";
import { contentBlocks, type PidianMessage } from "../domain/sessions/PidianSession";
import {
  applyAssistantError,
  applyTextDelta,
  applyThinkingDelta,
  applyToolCompleted,
  applyToolStarted,
  closeOpenWork,
} from "./assistantContent";

function assistant(overrides?: Partial<PidianMessage>): PidianMessage {
  return {
    id: "a1",
    role: "assistant",
    text: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("assistantContent", () => {
  it("splits work logs around text deltas", () => {
    const message = assistant();
    applyThinkingDelta(message, "plan");
    applyTextDelta(message, "I'll look.");
    applyToolStarted(message, { id: "1", name: "read_note", args: {} });
    applyToolCompleted(message, "1", "ok", false);
    applyThinkingDelta(message, "more");
    applyTextDelta(message, " Done.");

    expect(message.blocks).toEqual([
      expect.objectContaining({
        type: "work",
        thinking: "plan",
        workedMs: expect.any(Number),
      }),
      { type: "text", text: "I'll look." },
      expect.objectContaining({
        type: "work",
        thinking: "more",
        toolCalls: [
          { id: "1", name: "read_note", args: {}, result: "ok", isError: false },
        ],
        workedMs: expect.any(Number),
      }),
      { type: "text", text: " Done." },
    ]);
    expect(message.text).toBe("I'll look. Done.");
    expect(message.thinking).toBe("planmore");
    const firstWork = message.blocks?.[0];
    expect(firstWork?.type).toBe("work");
    expect(message.workedMs).toBe(firstWork?.type === "work" ? firstWork.workedMs : undefined);
  });

  it("keeps a single work segment when text before tools is only whitespace", () => {
    const message = assistant();
    applyThinkingDelta(message, "plan");
    applyTextDelta(message, "\n");
    applyToolStarted(message, { id: "1", name: "read_note", args: {} });
    applyToolCompleted(message, "1", "ok", false);
    applyTextDelta(message, "Done.");

    expect(message.blocks).toEqual([
      expect.objectContaining({
        type: "work",
        thinking: "plan",
        toolCalls: [{ id: "1", name: "read_note", args: {}, result: "ok", isError: false }],
        workedMs: expect.any(Number),
      }),
      { type: "text", text: "Done." },
    ]);
  });

  it("keeps the first work segment closed while a later one is still running", () => {
    const message = assistant();
    applyThinkingDelta(message, "plan");
    applyTextDelta(message, "Hi");
    const firstWorkedMs = message.blocks?.[0]?.type === "work" ? message.blocks[0].workedMs : undefined;
    applyToolStarted(message, { id: "1", name: "read_note", args: {} });

    expect(firstWorkedMs).toEqual(expect.any(Number));
    expect(message.blocks?.[0]).toMatchObject({ type: "work", workedMs: firstWorkedMs });
    expect(message.blocks?.[2]).toMatchObject({ type: "work" });
    expect(message.blocks?.[2]?.type === "work" ? message.blocks[2].workedMs : "missing").toBeUndefined();
  });

  it("records workedMs when work ends without text", () => {
    const message = assistant();
    applyThinkingDelta(message, "plan");
    closeOpenWork(message);
    expect(message.blocks?.[0]).toMatchObject({ type: "work", thinking: "plan", workedMs: expect.any(Number) });
  });

  it("appends errors as text after closing open work", () => {
    const message = assistant();
    applyThinkingDelta(message, "plan");
    applyAssistantError(message, "boom");
    expect(message.blocks).toEqual([
      expect.objectContaining({ type: "work", thinking: "plan", workedMs: expect.any(Number) }),
      { type: "text", text: "boom" },
    ]);
    applyAssistantError(message, "boom");
    expect(message.text).toBe("boom");
  });
});

describe("contentBlocks", () => {
  it("synthesizes a single work then text block for older sessions", () => {
    expect(
      contentBlocks({
        id: "a1",
        role: "assistant",
        text: "Hi",
        thinking: "plan",
        toolCalls: [{ id: "1", name: "read_note", args: {} }],
        workedMs: 1200,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual([
      {
        type: "work",
        thinking: "plan",
        toolCalls: [{ id: "1", name: "read_note", args: {} }],
        workedMs: 1200,
        startedAt: "2026-01-01T00:00:00.000Z",
      },
      { type: "text", text: "Hi" },
    ]);
  });

  it("merges work logs that have no visible text between them", () => {
    expect(
      contentBlocks({
        id: "a1",
        role: "assistant",
        text: "Hi",
        blocks: [
          {
            type: "work",
            thinking: "plan",
            workedMs: 1000,
            startedAt: "2026-01-01T00:00:00.000Z",
          },
          { type: "text", text: "\n" },
          {
            type: "work",
            thinking: "more",
            toolCalls: [{ id: "1", name: "read_note", args: {} }],
            workedMs: 6000,
            startedAt: "2026-01-01T00:00:01.000Z",
          },
          { type: "text", text: "Hi" },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual([
      {
        type: "work",
        thinking: "planmore",
        toolCalls: [{ id: "1", name: "read_note", args: {} }],
        workedMs: 7000,
        startedAt: "2026-01-01T00:00:00.000Z",
      },
      { type: "text", text: "Hi" },
    ]);
  });
});
