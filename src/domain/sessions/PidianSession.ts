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
  createdAt: string;
}

export function sumTokenUsage(messages: readonly PidianMessage[]): TokenUsage {
  let input = 0;
  let output = 0;
  for (const message of messages) {
    if (!message.usage) {
      continue;
    }
    input += message.usage.input;
    output += message.usage.output;
  }
  return { input, output };
}

export interface PidianSession {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
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
