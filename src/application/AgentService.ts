import type { AgentEngine } from "../domain/agent/AgentEngine";
import type { AgentEvent } from "../domain/agent/AgentEvent";
import type { AgentSession } from "../domain/agent/AgentSession";
import type { PidianTool } from "../domain/tools/PidianTool";
import type { PidianMessage, PidianSession } from "../domain/sessions/PidianSession";
import { DEFAULT_THINKING_LEVEL } from "../domain/agent/thinkingLevel";
import { ContextService, formatAgentPrompt } from "./ContextService";
import { SessionService } from "./SessionService";

export interface ChatListener {
  (): void;
}

export class AgentService {
  private current?: {
    session: PidianSession;
    agent?: AgentSession;
    unsubscribe: () => void;
  };
  private streaming = false;
  private error?: string;
  private readonly listeners = new Set<ChatListener>();
  private createTools: (sessionId: string) => PidianTool[];

  constructor(
    private readonly engine: AgentEngine,
    private readonly sessions: SessionService,
    private readonly context: ContextService,
    createTools: (sessionId: string) => PidianTool[],
  ) {
    this.createTools = createTools;
  }

  getSession(): PidianSession | undefined {
    return this.current?.session;
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  getError(): string | undefined {
    return this.error;
  }

  getContextPreview(): ReturnType<ContextService["snapshot"]> {
    return this.context.snapshot();
  }

  subscribe(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async newChat(provider: string, model: string, thinkingLevel?: string): Promise<PidianSession> {
    await this.disposeCurrent();
    const session = this.sessions.create(provider, model, thinkingLevel);
    this.current = {
      session,
      unsubscribe: () => undefined,
    };
    this.error = undefined;
    if (provider && model) {
      try {
        await this.ensureAgent();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    }
    this.notify();
    return session;
  }

  async openChat(id: string): Promise<PidianSession> {
    const loaded = await this.sessions.load(id);
    if (!loaded) {
      throw new Error(`Session not found: ${id}`);
    }
    await this.disposeCurrent();
    this.current = {
      session: loaded,
      unsubscribe: () => undefined,
    };
    this.error = undefined;
    if (loaded.provider && loaded.model) {
      try {
        await this.ensureAgent();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    }
    this.notify();
    return loaded;
  }

  async setModel(provider: string, model: string, thinkingLevel?: string): Promise<void> {
    const session = this.requireSession();
    const nextThinking = thinkingLevel ?? session.thinkingLevel;
    if (
      session.provider === provider &&
      session.model === model &&
      session.thinkingLevel === nextThinking &&
      (this.current?.agent || !provider)
    ) {
      return;
    }
    session.provider = provider;
    session.model = model;
    session.thinkingLevel = nextThinking;
    if (session.messages.length > 0) {
      await this.sessions.save(session);
    }
    await this.recreateAgent();
    this.notify();
  }

  async reloadModel(): Promise<void> {
    const session = this.getSession();
    if (!session?.provider || !session.model) {
      return;
    }
    await this.recreateAgent();
    this.notify();
  }

  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const session = this.requireSession();
    if (this.streaming) {
      throw new Error("The agent is already responding.");
    }

    const snapshot = this.context.snapshot();
    this.sessions.applyFirstUserTitle(session, trimmed);
    const userMessage: PidianMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    this.sessions.appendMessage(session, userMessage);
    this.sessions.appendMessage(session, {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      createdAt: new Date().toISOString(),
    });
    await this.sessions.save(session);

    this.streaming = true;
    this.error = undefined;
    this.notify();

    try {
      const agent = await this.ensureAgent();
      await agent.prompt({
        text: formatAgentPrompt(trimmed, snapshot),
        context: snapshot,
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.appendAssistantError(this.error);
      this.notify();
    } finally {
      this.streaming = false;
      await this.sessions.save(session);
      this.notify();
    }
  }

  async abort(): Promise<void> {
    await this.current?.agent?.abort();
  }

  async deleteCurrent(): Promise<void> {
    const session = this.current?.session;
    if (!session) {
      return;
    }
    await this.disposeCurrent();
    await this.sessions.delete(session.id);
    this.notify();
  }

  private async recreateAgent(): Promise<void> {
    const session = this.requireSession();
    this.current?.unsubscribe();
    await this.current?.agent?.dispose();
    this.current = { session, unsubscribe: () => undefined };
    if (!session.provider || !session.model) {
      this.error = undefined;
      return;
    }
    try {
      await this.ensureAgent();
      this.error = undefined;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async ensureAgent(): Promise<AgentSession> {
    const session = this.requireSession();
    if (this.current?.agent) {
      return this.current.agent;
    }
    const agent = await this.createAgent(session);
    this.current = {
      session,
      agent,
      unsubscribe: agent.subscribe((event) => this.handleEvent(event)),
    };
    return agent;
  }

  private async createAgent(session: PidianSession): Promise<AgentSession> {
    return this.engine.createSession({
      sessionId: session.id,
      provider: session.provider,
      model: session.model,
      thinkingLevel: session.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
      conversation: this.sessions.toConversation(session),
      tools: this.createTools(session.id),
    });
  }

  private handleEvent(event: AgentEvent): void {
    const assistant = this.latestAssistant();
    if (!assistant) {
      return;
    }
    switch (event.type) {
      case "text_delta":
        assistant.text += event.text;
        break;
      case "thinking_delta":
        assistant.thinking = `${assistant.thinking ?? ""}${event.text}`;
        break;
      case "tool_started":
        assistant.toolCalls = [
          ...(assistant.toolCalls ?? []),
          {
            id: event.toolCallId,
            name: event.toolName,
            args: event.args,
          },
        ];
        break;
      case "tool_completed": {
        const toolCall = assistant.toolCalls?.find((item) => item.id === event.toolCallId);
        if (toolCall) {
          toolCall.result = event.result;
          toolCall.isError = event.isError;
        }
        break;
      }
      case "error":
        this.error = event.message;
        this.appendAssistantError(event.message);
        break;
      case "turn_completed":
        if (event.usage) {
          assistant.usage = event.usage;
        }
        break;
    }
    this.notify();
  }

  private latestAssistant(): PidianMessage | undefined {
    const messages = this.current?.session.messages;
    if (!messages) {
      return undefined;
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "assistant") {
        return message;
      }
    }
    return undefined;
  }

  private appendAssistantError(message: string): void {
    const assistant = this.latestAssistant();
    if (!assistant) {
      return;
    }
    if (!assistant.text.includes(message)) {
      assistant.text = assistant.text ? `${assistant.text}\n\n${message}` : message;
    }
  }

  private requireSession(): PidianSession {
    if (!this.current) {
      throw new Error("No active chat session.");
    }
    return this.current.session;
  }

  private async disposeCurrent(): Promise<void> {
    this.current?.unsubscribe();
    await this.current?.agent?.dispose();
    this.current = undefined;
    this.streaming = false;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
