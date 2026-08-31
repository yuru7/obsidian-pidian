import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentConversation, AgentConversationMessage } from "../../domain/agent/AgentConversation";

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export interface PiBranchEntry {
  id: string;
  type: string;
  message?: { role?: string };
}

/**
 * Pidian user/assistant index of the first message Pi kept after compaction.
 * One Pidian assistant holds a whole turn, including extra Pi assistant/tool cycles.
 * Tool results belong to the preceding assistant.
 */
export function pidianIndexForFirstKept(
  entries: readonly PiBranchEntry[],
  firstKeptEntryId: string,
): number | undefined {
  let index = 0;
  let lastAssistantIndex: number | undefined;
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) {
      continue;
    }
    const role = entry.message.role;
    if (role === "user") {
      if (lastAssistantIndex === index) {
        index += 1;
      }
      if (entry.id === firstKeptEntryId) {
        return index;
      }
      lastAssistantIndex = undefined;
      index += 1;
    } else if (role === "assistant") {
      lastAssistantIndex = index;
      if (entry.id === firstKeptEntryId) {
        return index;
      }
    } else if (role === "toolResult" && entry.id === firstKeptEntryId) {
      return lastAssistantIndex;
    }
  }
  return undefined;
}

export function hydratePiSession(
  sessionManager: SessionManager,
  conversation: AgentConversation,
  model: Model<Api>,
): void {
  const ids = new Map<string, string>();
  for (const message of conversation.messages) {
    let firstId: string | undefined;
    for (const piMessage of toPiMessagesFor(message, model)) {
      const id = sessionManager.appendMessage(piMessage as never);
      firstId ??= id;
    }
    if (firstId) {
      ids.set(message.id, firstId);
    }
  }

  const compaction = conversation.compaction;
  if (!compaction) {
    return;
  }
  const firstKeptEntryId = ids.get(compaction.firstKeptMessageId);
  if (!firstKeptEntryId) {
    return;
  }
  sessionManager.appendCompaction(compaction.summary, firstKeptEntryId, compaction.tokensBefore ?? 0);
}

function toPiMessagesFor(message: AgentConversationMessage, model: Model<Api>): Array<Record<string, unknown>> {
  if (message.role === "user") {
    return [
      {
        role: "user",
        content: message.text,
        timestamp: Date.parse(message.createdAt) || Date.now(),
      },
    ];
  }

  const content: Array<Record<string, unknown>> = [];
  if (message.thinking) {
    content.push({ type: "thinking", thinking: message.thinking });
  }
  if (message.text) {
    content.push({ type: "text", text: message.text });
  }
  for (const toolCall of message.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.args && typeof toolCall.args === "object" ? toolCall.args : {},
    });
  }
  const messages: Array<Record<string, unknown>> = [
    {
      role: "assistant",
      content,
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: EMPTY_USAGE,
      stopReason: (message.toolCalls?.length ?? 0) > 0 ? "toolUse" : "stop",
      timestamp: Date.parse(message.createdAt) || Date.now(),
    },
  ];
  for (const toolCall of message.toolCalls ?? []) {
    messages.push({
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: "text", text: toolCall.result ?? "" }],
      isError: Boolean(toolCall.isError),
      timestamp: Date.parse(message.createdAt) || Date.now(),
    });
  }
  return messages;
}
