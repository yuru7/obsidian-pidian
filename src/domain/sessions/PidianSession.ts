import type { AgentToolCallRecord } from "../agent/AgentConversation";
import type { TokenUsage } from "../agent/AgentEvent";

export type PidianToolCall = AgentToolCallRecord;
export type { TokenUsage };

export type PidianWorkItem =
  | { type: "thinking"; text: string }
  | ({ type: "tool" } & PidianToolCall);

export interface PidianWorkBlock {
  type: "work";
  thinking?: string;
  toolCalls?: PidianToolCall[];
  /** Thinking and tool calls in stream order. Missing on older saved sessions. */
  items?: PidianWorkItem[];
  /** Milliseconds from this work segment start until the following text. */
  workedMs?: number;
  startedAt?: string;
}

export interface PidianTextBlock {
  type: "text";
  text: string;
}

export type PidianContentBlock = PidianWorkBlock | PidianTextBlock;

export interface PidianMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: PidianToolCall[];
  usage?: TokenUsage;
  /** Milliseconds from assistant start until the first answer text. */
  workedMs?: number;
  /** Interleaved work and text. Missing on older saved sessions. */
  blocks?: PidianContentBlock[];
  createdAt: string;
}

export function contentBlocks(message: PidianMessage): PidianContentBlock[] {
  const blocks = message.blocks ?? synthesizeLegacyBlocks(message);
  return coalesceAdjacentWork(blocks);
}

export function workItems(block: PidianWorkBlock): PidianWorkItem[] {
  if (block.items && block.items.length > 0) {
    return block.items;
  }
  const items: PidianWorkItem[] = [];
  if (block.thinking) {
    items.push({ type: "thinking", text: block.thinking });
  }
  for (const toolCall of block.toolCalls ?? []) {
    items.push({ type: "tool", ...toolCall });
  }
  return items;
}

function synthesizeLegacyBlocks(message: PidianMessage): PidianContentBlock[] {
  const blocks: PidianContentBlock[] = [];
  if (message.thinking || (message.toolCalls?.length ?? 0) > 0) {
    blocks.push({
      type: "work",
      thinking: message.thinking,
      toolCalls: message.toolCalls,
      ...(message.workedMs !== undefined ? { workedMs: message.workedMs } : {}),
      startedAt: message.createdAt,
    });
  }
  if (message.text) {
    blocks.push({ type: "text", text: message.text });
  }
  return blocks;
}

function coalesceAdjacentWork(blocks: readonly PidianContentBlock[]): PidianContentBlock[] {
  const result: PidianContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text" && !block.text.trim()) {
      continue;
    }
    const previous = result.at(-1);
    if (block.type === "work" && previous?.type === "work") {
      result[result.length - 1] = mergeWorkBlocks(previous, block);
      continue;
    }
    result.push(block);
  }
  return result;
}

function mergeWorkBlocks(left: PidianWorkBlock, right: PidianWorkBlock): PidianWorkBlock {
  const thinking = `${left.thinking ?? ""}${right.thinking ?? ""}`;
  const toolCalls = [...(left.toolCalls ?? []), ...(right.toolCalls ?? [])];
  const startedAt = left.startedAt ?? right.startedAt;
  const workedMs = combinedWorkedMs(left, right);
  const items = left.items || right.items ? [...workItems(left), ...workItems(right)] : undefined;
  return {
    type: "work",
    ...(thinking ? { thinking } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(items && items.length > 0 ? { items } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(workedMs !== undefined ? { workedMs } : {}),
  };
}

function combinedWorkedMs(left: PidianWorkBlock, right: PidianWorkBlock): number | undefined {
  if (right.workedMs === undefined) {
    return undefined;
  }
  if (left.workedMs === undefined) {
    return right.workedMs;
  }
  const start = Date.parse(left.startedAt ?? "");
  const next = Date.parse(right.startedAt ?? "");
  if (Number.isFinite(start) && Number.isFinite(next)) {
    return Math.max(0, next + right.workedMs - start);
  }
  return left.workedMs + right.workedMs;
}

export function sumTokenUsage(messages: readonly PidianMessage[]): TokenUsage {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const message of messages) {
    if (!message.usage) {
      continue;
    }
    input += message.usage.input;
    output += message.usage.output;
    cacheRead += message.usage.cacheRead;
    cacheWrite += message.usage.cacheWrite;
  }
  return { input, output, cacheRead, cacheWrite };
}

export interface PidianSession {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  thinkingLevel?: string;
  /** Number of inherited messages when this session was forked; the fork notice is shown after this many. */
  forkedMessageCount?: number;
  messages: PidianMessage[];
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  model: string;
  provider: string;
}

export interface SessionRepository {
  save(session: PidianSession): Promise<void>;
  load(id: string): Promise<PidianSession | undefined>;
  list(): Promise<SessionSummary[]>;
  delete(id: string): Promise<void>;
}
