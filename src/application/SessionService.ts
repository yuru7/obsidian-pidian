import type {
  PidianMessage,
  PidianSession,
  SessionRepository,
  SessionSummary,
} from "../domain/sessions/PidianSession";
import { compactionAfterFork } from "../domain/sessions/PidianSession";
import type { AgentConversation } from "../domain/agent/AgentConversation";
import { formatAgentPrompt } from "./ContextService";
import { parsePidianSession } from "./sessionSerialization";
import { NEW_CHAT_TITLE, titleFromUserMessage } from "./sessionTitle";

export class SessionService {
  constructor(private readonly repository: SessionRepository) {}

  create(provider: string, model: string, thinkingLevel?: string): PidianSession {
    const now = new Date().toISOString();
    return {
      version: 1,
      id: crypto.randomUUID(),
      title: NEW_CHAT_TITLE,
      createdAt: now,
      updatedAt: now,
      provider,
      model,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      messages: [],
    };
  }

  async save(session: PidianSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    await this.repository.save(parsePidianSession(session));
  }

  async load(id: string): Promise<PidianSession | undefined> {
    return this.repository.load(id);
  }

  async list(): Promise<SessionSummary[]> {
    return this.repository.list();
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  applyFirstUserTitle(session: PidianSession, text: string): void {
    if (session.messages.some((message) => message.role === "user")) {
      return;
    }
    session.title = titleFromUserMessage(text);
  }

  toConversation(session: PidianSession): AgentConversation {
    return {
      messages: session.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text:
          message.role === "user"
            ? formatAgentPrompt(message.text, message.context, message.createdAt)
            : message.text,
        thinking: message.thinking,
        toolCalls: message.toolCalls,
        createdAt: message.createdAt,
      })),
      ...(session.compaction
        ? {
            compaction: {
              summary: session.compaction.summary,
              firstKeptMessageId: session.compaction.firstKeptMessageId,
              ...(session.compaction.tokensBefore !== undefined
                ? { tokensBefore: session.compaction.tokensBefore }
                : {}),
            },
          }
        : {}),
    };
  }

  appendMessage(session: PidianSession, message: PidianMessage): void {
    session.messages.push(message);
  }

  /** Drop the selected user message and everything after it. Keeps the prior turn. */
  truncateBefore(session: PidianSession, messageId: string): void {
    const index = session.messages.findIndex((message) => message.id === messageId);
    if (index < 0) {
      throw new Error(`Message not found: ${messageId}`);
    }
    if (session.messages[index]?.role !== "user") {
      throw new Error("Only user messages can be edited.");
    }
    session.messages = session.messages.slice(0, index);
    const compaction = compactionAfterFork(session.compaction, session.messages);
    if (compaction) {
      session.compaction = compaction;
    } else {
      delete session.compaction;
    }
    if (session.forkedMessageCount !== undefined && session.forkedMessageCount > session.messages.length) {
      delete session.forkedMessageCount;
    }
  }

  fork(source: PidianSession, messageId: string): PidianSession {
    const index = source.messages.findIndex((message) => message.id === messageId);
    if (index < 0) {
      throw new Error(`Message not found: ${messageId}`);
    }
    const now = new Date().toISOString();
    const messages = structuredClone(source.messages.slice(0, index + 1));
    const compaction = compactionAfterFork(source.compaction, messages);
    return {
      version: 1,
      id: crypto.randomUUID(),
      title: source.title,
      createdAt: now,
      updatedAt: now,
      provider: source.provider,
      model: source.model,
      ...(source.thinkingLevel ? { thinkingLevel: source.thinkingLevel } : {}),
      forkedMessageCount: index + 1,
      ...(compaction ? { compaction } : {}),
      messages,
    };
  }
}
