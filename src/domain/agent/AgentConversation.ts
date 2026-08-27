export interface AgentToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: string;
  isError?: boolean;
}

export interface AgentConversationMessage {
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: AgentToolCallRecord[];
  createdAt: string;
}

export interface AgentConversation {
  messages: AgentConversationMessage[];
}
