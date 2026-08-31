import type { TokenUsage } from "../domain/agent/AgentEvent";
import { parseOptionalThinkingLevel } from "../domain/agent/thinkingLevel";
import type { PidianContentBlock, PidianMessage, PidianSession, PidianToolCall, PidianWorkItem } from "../domain/sessions/PidianSession";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid session field: ${field}`);
  }
  return value;
}

function parseTokenCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid session field: ${field}`);
  }
  return value;
}

function parseOptionalTokenCount(value: unknown, field: string): number {
  if (value === undefined) {
    return 0;
  }
  return parseTokenCount(value, field);
}

function parseOptionalForkedMessageCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function parseOptionalWorkedMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function parseUsage(value: unknown, field: string): TokenUsage | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Invalid session field: ${field}`);
  }
  return {
    input: parseTokenCount(value.input, `${field}.input`),
    output: parseTokenCount(value.output, `${field}.output`),
    cacheRead: parseOptionalTokenCount(value.cacheRead, `${field}.cacheRead`),
    cacheWrite: parseOptionalTokenCount(value.cacheWrite, `${field}.cacheWrite`),
  };
}

function parseToolCallRecord(item: Record<string, unknown>, field: string): PidianToolCall {
  return {
    id: expectString(item.id, `${field}.id`),
    name: expectString(item.name, `${field}.name`),
    args: item.args,
    result: typeof item.result === "string" ? item.result : undefined,
    isError: typeof item.isError === "boolean" ? item.isError : undefined,
  };
}

function parseToolCalls(value: unknown): PidianMessage["toolCalls"] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("Invalid session field: messages.toolCalls");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid session field: messages.toolCalls[]");
    }
    return parseToolCallRecord(item, "toolCalls");
  });
}

function parseWorkItems(value: unknown): PidianWorkItem[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("Invalid session field: messages.blocks[].items");
  }
  const items: PidianWorkItem[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      throw new Error("Invalid session field: messages.blocks[].items[]");
    }
    if (item.type === "thinking") {
      items.push({ type: "thinking", text: typeof item.text === "string" ? item.text : "" });
      continue;
    }
    if (item.type !== "tool") {
      throw new Error("Invalid session field: messages.blocks[].items[].type");
    }
    items.push({ type: "tool", ...parseToolCallRecord(item, "items") });
  }
  return items.length > 0 ? items : undefined;
}

function parseContentBlocks(value: unknown): PidianContentBlock[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("Invalid session field: messages.blocks");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid session field: messages.blocks[]");
    }
    if (item.type === "text") {
      return { type: "text", text: typeof item.text === "string" ? item.text : "" };
    }
    if (item.type !== "work") {
      throw new Error("Invalid session field: messages.blocks[].type");
    }
    const workedMs = parseOptionalWorkedMs(item.workedMs);
    const startedAt = typeof item.startedAt === "string" && item.startedAt ? item.startedAt : undefined;
    const items = parseWorkItems(item.items);
    return {
      type: "work",
      thinking: typeof item.thinking === "string" ? item.thinking : undefined,
      toolCalls: parseToolCalls(item.toolCalls),
      ...(items ? { items } : {}),
      ...(workedMs !== undefined ? { workedMs } : {}),
      ...(startedAt ? { startedAt } : {}),
    };
  });
}

function parseMessage(value: unknown): PidianMessage {
  if (!isRecord(value)) {
    throw new Error("Invalid session field: messages[]");
  }
  const role = expectString(value.role, "messages.role");
  if (role !== "user" && role !== "assistant") {
    throw new Error("Invalid session field: messages.role");
  }
  const usage = parseUsage(value.usage, "messages.usage");
  const workedMs = parseOptionalWorkedMs(value.workedMs);
  const blocks = parseContentBlocks(value.blocks);
  return {
    id: expectString(value.id, "messages.id"),
    role,
    text: typeof value.text === "string" ? value.text : "",
    thinking: typeof value.thinking === "string" ? value.thinking : undefined,
    toolCalls: parseToolCalls(value.toolCalls),
    ...(usage ? { usage } : {}),
    ...(workedMs !== undefined ? { workedMs } : {}),
    ...(blocks ? { blocks } : {}),
    createdAt: expectString(value.createdAt, "messages.createdAt"),
  };
}

function parseV1(raw: Record<string, unknown>): PidianSession {
  if (!Array.isArray(raw.messages)) {
    throw new Error("Invalid session field: messages");
  }
  const thinkingLevel = parseOptionalThinkingLevel(raw.thinkingLevel);
  const forkedMessageCount = parseOptionalForkedMessageCount(raw.forkedMessageCount);
  return {
    version: 1,
    id: expectString(raw.id, "id"),
    title: expectString(raw.title, "title"),
    createdAt: expectString(raw.createdAt, "createdAt"),
    updatedAt: expectString(raw.updatedAt, "updatedAt"),
    provider: expectString(raw.provider, "provider"),
    model: expectString(raw.model, "model"),
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(forkedMessageCount !== undefined ? { forkedMessageCount } : {}),
    messages: raw.messages.map(parseMessage),
  };
}

export function migratePidianSession(raw: unknown): PidianSession {
  if (!isRecord(raw)) {
    throw new Error("Session data must be an object.");
  }
  const version = raw.version;
  if (version === 1) {
    return parseV1(raw);
  }
  throw new Error(`Unsupported session version: ${String(version)}`);
}

export function parsePidianSession(raw: unknown): PidianSession {
  return migratePidianSession(raw);
}

export function serializePidianSession(session: PidianSession): string {
  return JSON.stringify(parsePidianSession(session), null, 2);
}

export function unwrapSessionFileText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return fenced ? fenced[1]! : trimmed;
}

export function serializeSessionFile(session: PidianSession, markdown: boolean): string {
  const json = serializePidianSession(session);
  return markdown ? `\`\`\`json\n${json}\n\`\`\`\n` : json;
}

export function parseSessionFile(raw: string): PidianSession {
  return parsePidianSession(JSON.parse(unwrapSessionFileText(raw)));
}
