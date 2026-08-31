import type { AgentEvent, TokenUsage } from "../../domain/agent/AgentEvent";
import { pidianIndexForFirstKept, type PiBranchEntry } from "./piSessionHydration";

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
  messages?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function usageFromPiMessages(messages: unknown): TokenUsage | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let found = false;
  for (const item of messages) {
    if (!isRecord(item) || !isRecord(item.usage)) {
      continue;
    }
    const record = item.usage;
    if (typeof record.input !== "number" && typeof record.output !== "number") {
      continue;
    }
    input += typeof record.input === "number" ? record.input : 0;
    output += typeof record.output === "number" ? record.output : 0;
    cacheRead += typeof record.cacheRead === "number" ? record.cacheRead : 0;
    cacheWrite += typeof record.cacheWrite === "number" ? record.cacheWrite : 0;
    found = true;
  }
  return found ? { input, output, cacheRead, cacheWrite } : undefined;
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
      if (inner?.type === "thinking_start") {
        return { type: "thinking_start" };
      }
      if (inner?.type === "thinking_delta" && inner.delta) {
        return { type: "thinking_delta", text: inner.delta };
      }
      if (inner?.type === "thinking_end") {
        return { type: "thinking_end" };
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
    case "agent_end": {
      const usage = usageFromPiMessages(event.messages);
      return usage ? { type: "turn_completed", usage } : { type: "turn_completed" };
    }
    default:
      return undefined;
  }
}

export function mapPiCompactionEvent(
  event: { type: string; result?: unknown; aborted?: boolean },
  entries: readonly PiBranchEntry[],
): AgentEvent | undefined {
  if (event.type === "compaction_start") {
    return { type: "compaction_start" };
  }
  if (event.type !== "compaction_end") {
    return undefined;
  }
  if (event.aborted) {
    return { type: "compaction_failed" };
  }
  const result = event.result;
  if (!isCompactionResult(result)) {
    return { type: "compaction_failed" };
  }
  const firstKeptIndex = pidianIndexForFirstKept(entries, result.firstKeptEntryId);
  return {
    type: "compacted",
    summary: result.summary,
    ...(firstKeptIndex !== undefined ? { firstKeptIndex } : {}),
    ...(typeof result.tokensBefore === "number" ? { tokensBefore: result.tokensBefore } : {}),
  };
}

function isCompactionResult(
  value: unknown,
): value is { summary: string; firstKeptEntryId: string; tokensBefore?: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.summary === "string" && record.summary.length > 0 && typeof record.firstKeptEntryId === "string";
}
