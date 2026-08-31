export interface AgentToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: string;
  isError?: boolean;
}

export interface AgentConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: AgentToolCallRecord[];
  createdAt: string;
}

export interface AgentConversationCompaction {
  summary: string;
  firstKeptMessageId: string;
  tokensBefore?: number;
}

export interface AgentConversation {
  messages: AgentConversationMessage[];
  compaction?: AgentConversationCompaction;
}
