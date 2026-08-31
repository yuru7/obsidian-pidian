export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  text: string;
}

export interface ThinkingStartEvent {
  type: "thinking_start";
}

export interface ThinkingEndEvent {
  type: "thinking_end";
}

export interface ToolStartedEvent {
  type: "tool_started";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolCompletedEvent {
  type: "tool_completed";
  toolCallId: string;
  toolName: string;
  result: string;
  isError: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface TurnCompletedEvent {
  type: "turn_completed";
  usage?: TokenUsage;
}

export interface AgentErrorEvent {
  type: "error";
  message: string;
}

export interface CompactionStartEvent {
  type: "compaction_start";
}

export interface CompactedEvent {
  type: "compacted";
  summary: string;
  /** Index into the current Pidian message list of the first message kept verbatim. */
  firstKeptIndex?: number;
  tokensBefore?: number;
}

export interface CompactionFailedEvent {
  type: "compaction_failed";
}

export type AgentEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ThinkingStartEvent
  | ThinkingEndEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | TurnCompletedEvent
  | AgentErrorEvent
  | CompactionStartEvent
  | CompactedEvent
  | CompactionFailedEvent;

export type AgentEventListener = (event: AgentEvent) => void;
