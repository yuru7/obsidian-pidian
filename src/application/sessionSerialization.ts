import type { TokenUsage } from "../domain/agent/AgentEvent";
import { parseOptionalThinkingLevel } from "../domain/agent/thinkingLevel";
import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";
import {
  clipSessionQuery,
  type PidianContentBlock,
  type PidianMessage,
  type PidianSession,
  type PidianToolCall,
  type PidianWorkItem,
  type SessionCompaction,
  type SessionSummary,
} from "../domain/sessions/PidianSession";

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

function parseOptionalCompaction(
  value: unknown,
  messages: readonly PidianMessage[],
): SessionCompaction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.summary !== "string" || value.summary.length === 0) {
    return undefined;
  }
  if (typeof value.firstKeptMessageId !== "string" || value.firstKeptMessageId.length === 0) {
    return undefined;
  }
  if (typeof value.createdAt !== "string" || value.createdAt.length === 0) {
    return undefined;
  }
  if (!messages.some((message) => message.id === value.firstKeptMessageId)) {
    return undefined;
  }
  const tokensBefore =
    typeof value.tokensBefore === "number" && Number.isFinite(value.tokensBefore) && value.tokensBefore >= 0
      ? value.tokensBefore
      : undefined;
  return {
    summary: value.summary,
    firstKeptMessageId: value.firstKeptMessageId,
    createdAt: value.createdAt,
    ...(tokensBefore !== undefined ? { tokensBefore } : {}),
  };
}

function parseOptionalWorkedMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function parseOptionalContext(value: unknown): ContextSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.notePath !== "string" || value.notePath.length === 0) {
    return undefined;
  }
  if (!isPositiveInt(value.startLine) || !isPositiveInt(value.endLine) || value.endLine < value.startLine) {
    return undefined;
  }
  return {
    notePath: value.notePath,
    startLine: value.startLine,
    endLine: value.endLine,
  };
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
  const context = role === "user" ? parseOptionalContext(value.context) : undefined;
  return {
    id: expectString(value.id, "messages.id"),
    role,
    text: typeof value.text === "string" ? value.text : "",
    ...(context ? { context } : {}),
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
  const messages = raw.messages.map(parseMessage);
  const compaction = parseOptionalCompaction(raw.compaction, messages);
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
    ...(compaction ? { compaction } : {}),
    messages,
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
  const parsed = parsePidianSession(session);
  const { messages, ...header } = parsed;
  return [header, ...messages].map((record) => JSON.stringify(record)).join("\n");
}

const OPENING_FENCE = /^```jsonl?[ \t]*\r?\n/;

export function unwrapSessionFileText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```jsonl?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return fenced ? fenced[1]! : trimmed;
}

/** List fields only. JSONL stops after the header and first user message. */
export function parseSessionSummary(raw: string): SessionSummary {
  const body = skipOpeningFence(raw);
  const first = readJsonlLine(body, 0);
  if (first) {
    let parsed: unknown | undefined;
    try {
      parsed = JSON.parse(first.line);
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
    }
    if (isRecord(parsed)) {
      if (Array.isArray(parsed.messages)) {
        return sessionSummaryFromHeader(parsed, firstUserQuery(parsed.messages));
      }
      return sessionSummaryFromHeader(parsed, firstUserQueryFromJsonl(body, first.next));
    }
    if (parsed !== undefined) {
      throw new Error("Session data must be an object.");
    }
  }
  const parsed = JSON.parse(unwrapSessionFileText(raw));
  if (!isRecord(parsed)) {
    throw new Error("Session data must be an object.");
  }
  return sessionSummaryFromHeader(parsed, firstUserQuery(parsed.messages));
}

function skipOpeningFence(raw: string): string {
  const trimmed = raw.trimStart();
  const fence = OPENING_FENCE.exec(trimmed);
  return fence ? trimmed.slice(fence[0].length) : trimmed;
}

function readJsonlLine(text: string, start: number): { line: string; next: number } | undefined {
  let index = start;
  while (index < text.length) {
    const newline = text.indexOf("\n", index);
    const end = newline === -1 ? text.length : newline;
    let line = text.slice(index, end);
    if (line.endsWith("\r")) {
      line = line.slice(0, -1);
    }
    const next = newline === -1 ? text.length : newline + 1;
    if (line.trim() === "```") {
      return undefined;
    }
    if (line.length > 0) {
      return { line, next };
    }
    index = next;
  }
  return undefined;
}

function firstUserQueryFromJsonl(text: string, start: number): string {
  let index = start;
  for (;;) {
    const item = readJsonlLine(text, index);
    if (!item) {
      return "";
    }
    index = item.next;
    const record = JSON.parse(item.line);
    if (isRecord(record) && record.role === "user") {
      return typeof record.text === "string" ? record.text : "";
    }
  }
}

function firstUserQuery(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return "";
  }
  for (const item of messages) {
    if (isRecord(item) && item.role === "user") {
      return typeof item.text === "string" ? item.text : "";
    }
  }
  return "";
}

function sessionSummaryFromHeader(header: Record<string, unknown>, firstQuery: string): SessionSummary {
  if (header.version !== 1) {
    throw new Error(`Unsupported session version: ${String(header.version)}`);
  }
  return {
    id: expectString(header.id, "id"),
    title: expectString(header.title, "title"),
    updatedAt: expectString(header.updatedAt, "updatedAt"),
    provider: expectString(header.provider, "provider"),
    model: expectString(header.model, "model"),
    firstQuery: clipSessionQuery(firstQuery),
  };
}

export function serializeSessionFile(session: PidianSession, markdown: boolean): string {
  const jsonl = serializePidianSession(session);
  return markdown ? `\`\`\`json\n${jsonl}\n\`\`\`\n` : jsonl;
}

export function parseSessionFile(raw: string): PidianSession {
  const text = unwrapSessionFileText(raw);
  try {
    const parsed = JSON.parse(text);
    if (isRecord(parsed) && !Array.isArray(parsed.messages)) {
      return parsePidianSession({ ...parsed, messages: [] });
    }
    return parsePidianSession(parsed);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }
  return parseJsonlSession(text);
}

function parseJsonlSession(text: string): PidianSession {
  const records = text.split(/\r?\n/).filter((line) => line.length > 0).map((line) => JSON.parse(line));
  const header = records[0];
  if (!isRecord(header) || Array.isArray(header.messages)) {
    throw new Error("Session data must be an object.");
  }
  return parsePidianSession({ ...header, messages: records.slice(1) });
}
