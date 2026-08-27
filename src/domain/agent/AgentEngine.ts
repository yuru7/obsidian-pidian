import type { AgentConversation } from "./AgentConversation";
import type { AgentSession } from "./AgentSession";
import type { PidianTool } from "../tools/PidianTool";

export interface AgentSessionOptions {
  sessionId: string;
  provider: string;
  model: string;
  conversation?: AgentConversation;
  instructions?: string;
  tools: PidianTool[];
}

export interface AgentEngine {
  createSession(options: AgentSessionOptions): Promise<AgentSession>;
}
