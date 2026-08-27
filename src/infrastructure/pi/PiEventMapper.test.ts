import { describe, expect, it } from "vitest";
import { mapPiEvent } from "./PiEventMapper";

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
        assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
      }),
    ).toEqual({ type: "thinking_delta", text: "hmm" });
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
          { role: "assistant", usage: { input: 10, output: 4 } },
          { role: "toolResult", usage: { input: 2, output: 1 } },
        ],
      }),
    ).toEqual({ type: "turn_completed", usage: { input: 12, output: 5 } });
    expect(
      mapPiEvent({
        type: "tool_execution_end",
        toolCallId: "2",
        toolName: "edit_note",
        result: { content: [{ type: "text", text: "denied" }], details: { isError: true } },
      }),
    ).toMatchObject({ isError: true, result: "denied" });
  });

  it("ignores unrelated Pi events", () => {
    expect(mapPiEvent({ type: "turn_start" })).toBeUndefined();
  });
});
