import type { AgentEvent } from "../../domain/agent/AgentEvent";

export interface PiLikeAssistantEvent {
  type: string;
  delta?: string;
}

export interface PiLikeEvent {
  type: string;
  assistantMessageEvent?: PiLikeAssistantEvent;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

function hasErrorDetail(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      "details" in result &&
      (result as { details?: { isError?: boolean } }).details?.isError,
  );
}

function toolResultText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    const record = result as {
      content?: Array<{ type?: string; text?: string }>;
      text?: string;
    };
    if (typeof record.text === "string") {
      return record.text;
    }
    if (Array.isArray(record.content)) {
      return record.content
        .map((item) => (item.type === "text" && typeof item.text === "string" ? item.text : ""))
        .filter(Boolean)
        .join("\n");
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export function mapPiEvent(event: PiLikeEvent): AgentEvent | undefined {
  switch (event.type) {
    case "message_update": {
      const inner = event.assistantMessageEvent;
      if (inner?.type === "text_delta" && inner.delta) {
        return { type: "text_delta", text: inner.delta };
      }
      if (inner?.type === "thinking_delta" && inner.delta) {
        return { type: "thinking_delta", text: inner.delta };
      }
      return undefined;
    }
    case "tool_execution_start":
      if (!event.toolCallId || !event.toolName) {
        return undefined;
      }
      return {
        type: "tool_started",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      };
    case "tool_execution_end":
      if (!event.toolCallId || !event.toolName) {
        return undefined;
      }
      return {
        type: "tool_completed",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: toolResultText(event.result),
        isError: Boolean(event.isError) || hasErrorDetail(event.result),
      };
    case "agent_end":
      return { type: "turn_completed" };
    default:
      return undefined;
  }
}
