import type { AgentToolCallRecord } from "../agent/AgentConversation";
import type { TokenUsage } from "../agent/AgentEvent";

export type PidianToolCall = AgentToolCallRecord;
export type { TokenUsage };

export interface PidianMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: PidianToolCall[];
  usage?: TokenUsage;
  /** Elapsed time of the assistant turn, in milliseconds. */
  workedMs?: number;
  createdAt: string;
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
