export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  text: string;
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
}

export interface TurnCompletedEvent {
  type: "turn_completed";
  usage?: TokenUsage;
}

export interface AgentErrorEvent {
  type: "error";
  message: string;
}

export type AgentEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | TurnCompletedEvent
  | AgentErrorEvent;

export type AgentEventListener = (event: AgentEvent) => void;
