import type { ContextSnapshot } from "../notes/ContextSnapshot";
import type { AgentEventListener } from "./AgentEvent";

export interface AgentPrompt {
  text: string;
  context?: ContextSnapshot;
}

export interface AgentSession {
  prompt(request: AgentPrompt): Promise<void>;
  abort(): Promise<void>;
  subscribe(listener: AgentEventListener): () => void;
  dispose(): Promise<void>;
}
