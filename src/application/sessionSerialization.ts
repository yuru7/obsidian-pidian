import type { TokenUsage } from "../domain/agent/AgentEvent";
import type { PidianMessage, PidianSession } from "../domain/sessions/PidianSession";

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
    return {
      id: expectString(item.id, "toolCalls.id"),
      name: expectString(item.name, "toolCalls.name"),
      args: item.args,
      result: typeof item.result === "string" ? item.result : undefined,
      isError: typeof item.isError === "boolean" ? item.isError : undefined,
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
  return {
    id: expectString(value.id, "messages.id"),
    role,
    text: typeof value.text === "string" ? value.text : "",
    thinking: typeof value.thinking === "string" ? value.thinking : undefined,
    toolCalls: parseToolCalls(value.toolCalls),
    ...(usage ? { usage } : {}),
    createdAt: expectString(value.createdAt, "messages.createdAt"),
  };
}

function parseV1(raw: Record<string, unknown>): PidianSession {
  if (!Array.isArray(raw.messages)) {
    throw new Error("Invalid session field: messages");
  }
  return {
    version: 1,
    id: expectString(raw.id, "id"),
    title: expectString(raw.title, "title"),
    createdAt: expectString(raw.createdAt, "createdAt"),
    updatedAt: expectString(raw.updatedAt, "updatedAt"),
    provider: expectString(raw.provider, "provider"),
    model: expectString(raw.model, "model"),
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
