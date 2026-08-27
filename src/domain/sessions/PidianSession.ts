import type { AgentToolCallRecord } from "../agent/AgentConversation";

export type PidianToolCall = AgentToolCallRecord;

export interface PidianMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: PidianToolCall[];
  createdAt: string;
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
