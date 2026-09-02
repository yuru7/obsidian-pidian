import { describe, expect, it } from "vitest";
import { mapPiCompactionEvent, mapPiEvent } from "./PiEventMapper";

describe("PiEventMapper", () => {
  it("maps text and thinking deltas", () => {
    expect(
      mapPiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hi" },
      }),
    ).toEqual({ type: "text_delta", text: "Hi" });
    expect(
      mapPiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_start" },
      }),
    ).toEqual({ type: "thinking_start" });
    expect(
      mapPiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
      }),
    ).toEqual({ type: "thinking_delta", text: "hmm" });
    expect(
      mapPiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_end" },
      }),
    ).toEqual({ type: "thinking_end" });
  });

  it("maps tool lifecycle and turn completion", () => {
    expect(
      mapPiEvent({
        type: "tool_execution_start",
        toolCallId: "1",
        toolName: "read_note",
        args: { path: "a.md" },
      }),
    ).toEqual({
      type: "tool_started",
      toolCallId: "1",
      toolName: "read_note",
      args: { path: "a.md" },
    });
    expect(
      mapPiEvent({
        type: "tool_execution_end",
        toolCallId: "1",
        toolName: "read_note",
        result: { content: [{ type: "text", text: "ok" }] },
        isError: false,
      }),
    ).toEqual({
      type: "tool_completed",
      toolCallId: "1",
      toolName: "read_note",
      result: "ok",
      isError: false,
    });
    expect(mapPiEvent({ type: "agent_end" })).toEqual({ type: "turn_completed" });
    expect(
      mapPiEvent({
        type: "agent_end",
        messages: [
          { role: "assistant", usage: { input: 10, output: 4, cacheRead: 6, cacheWrite: 2 } },
          { role: "toolResult", usage: { input: 2, output: 1, cacheRead: 1, cacheWrite: 3 } },
        ],
      }),
    ).toEqual({
      type: "turn_completed",
      usage: { input: 12, output: 5, cacheRead: 7, cacheWrite: 5 },
    });
    expect(
      mapPiEvent({
        type: "agent_end",
        messages: [{ role: "assistant", usage: { input: 10, output: 4 } }],
      }),
    ).toEqual({
      type: "turn_completed",
      usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0 },
    });
    expect(
      mapPiEvent({
        type: "tool_execution_end",
        toolCallId: "2",
        toolName: "edit_markdown",
        result: { content: [{ type: "text", text: "denied" }], details: { isError: true } },
      }),
    ).toMatchObject({ isError: true, result: "denied" });
  });

  it("maps compaction lifecycle", () => {
    const entries = [
      { id: "u1", type: "message", message: { role: "user" } },
      { id: "a1", type: "message", message: { role: "assistant" } },
      { id: "t1", type: "message", message: { role: "toolResult" } },
      { id: "u2", type: "message", message: { role: "user" } },
    ];
    expect(mapPiCompactionEvent({ type: "compaction_start" }, entries)).toEqual({ type: "compaction_start" });
    expect(
      mapPiCompactionEvent(
        {
          type: "compaction_end",
          result: { summary: "## Goal", firstKeptEntryId: "u2", tokensBefore: 12000 },
        },
        entries,
      ),
    ).toEqual({
      type: "compacted",
      summary: "## Goal",
      firstKeptIndex: 2,
      tokensBefore: 12000,
    });
    expect(
      mapPiCompactionEvent(
        { type: "compaction_end", result: { summary: "## Goal", firstKeptEntryId: "t1" } },
        entries,
      ),
    ).toEqual({ type: "compacted", summary: "## Goal", firstKeptIndex: 1 });
    expect(
      mapPiCompactionEvent(
        { type: "compaction_end", result: { summary: "## Goal", firstKeptEntryId: "missing" } },
        entries,
      ),
    ).toEqual({ type: "compacted", summary: "## Goal" });
    expect(mapPiCompactionEvent({ type: "compaction_end", aborted: true }, entries)).toEqual({
      type: "compaction_failed",
    });
  });

  it("ignores unrelated Pi events", () => {
    expect(mapPiEvent({ type: "turn_start" })).toBeUndefined();
  });
});
