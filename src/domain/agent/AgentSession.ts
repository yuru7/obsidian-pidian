import type { ContextSnapshot } from "../notes/ContextSnapshot";
import type { AgentEventListener } from "./AgentEvent";

export interface AgentPromptImage {
  mimeType: string;
  data: string;
}

export interface AgentPrompt {
  text: string;
  context?: ContextSnapshot;
  /** Images for this turn only. Restored sessions do not re-attach them. */
  images?: AgentPromptImage[];
}

export interface AgentSession {
  prompt(request: AgentPrompt): Promise<void>;
  abort(): Promise<void>;
  subscribe(listener: AgentEventListener): () => void;
  dispose(): Promise<void>;
}
