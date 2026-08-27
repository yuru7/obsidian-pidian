import type {
  PidianMessage,
  PidianSession,
  SessionRepository,
  SessionSummary,
} from "../domain/sessions/PidianSession";
import type { AgentConversation } from "../domain/agent/AgentConversation";
import { parsePidianSession } from "./sessionSerialization";
import { titleFromUserMessage } from "./sessionTitle";

export class SessionService {
  constructor(private readonly repository: SessionRepository) {}

  create(provider: string, model: string): PidianSession {
    const now = new Date().toISOString();
    return {
      version: 1,
      id: crypto.randomUUID(),
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      provider,
      model,
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
        role: message.role,
        text: message.text,
        thinking: message.thinking,
        toolCalls: message.toolCalls,
        createdAt: message.createdAt,
      })),
    };
  }

  appendMessage(session: PidianSession, message: PidianMessage): void {
    session.messages.push(message);
  }
}
