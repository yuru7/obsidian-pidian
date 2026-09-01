import type { AgentEngine } from "../domain/agent/AgentEngine";
import type { AgentEvent } from "../domain/agent/AgentEvent";
import type { AgentSession } from "../domain/agent/AgentSession";
import type { PidianTool } from "../domain/tools/PidianTool";
import type { PidianMessage, PidianSession } from "../domain/sessions/PidianSession";
import { DEFAULT_THINKING_LEVEL } from "../domain/agent/thinkingLevel";
import {
  applyAssistantError,
  applyTextDelta,
  applyThinkingDelta,
  applyThinkingEnd,
  applyThinkingIdle,
  applyThinkingStart,
  applyToolCompleted,
  applyToolStarted,
  closeOpenWork,
  isThinkingOpen,
  THINKING_IDLE_MS,
} from "./assistantContent";
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
  private compacting = false;
  private error?: string;
  private thinkingIdleTimer: ReturnType<typeof setTimeout> | undefined;
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

  isCompacting(): boolean {
    return this.compacting;
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

  async forkFrom(messageId: string): Promise<PidianSession> {
    if (this.streaming) {
      throw new Error("The agent is already responding.");
    }
    const source = this.requireSession();
    const session = this.sessions.fork(source, messageId);
    await this.disposeCurrent();
    this.current = {
      session,
      unsubscribe: () => undefined,
    };
    this.error = undefined;
    if (session.provider && session.model) {
      try {
        await this.ensureAgent();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    }
    await this.sessions.save(session);
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

  async editAndResend(messageId: string, text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (this.streaming) {
      throw new Error("The agent is already responding.");
    }
    const session = this.requireSession();
    this.sessions.truncateBefore(session, messageId);
    this.notify();
    await this.recreateAgent();
    await this.sessions.save(session);
    await this.send(trimmed);
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
      ...(snapshot ? { context: { ...snapshot } } : {}),
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
        text: formatAgentPrompt(trimmed, snapshot, userMessage.createdAt),
        context: snapshot,
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      const failed = this.latestAssistant();
      if (failed) {
        applyAssistantError(failed, this.error);
      }
      this.notify();
    } finally {
      this.clearThinkingIdle();
      this.streaming = false;
      const assistant = this.latestAssistant();
      if (assistant) {
        closeOpenWork(assistant);
      }
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
    if (event.type === "compaction_start") {
      this.compacting = true;
      this.notify();
      return;
    }
    if (event.type === "compaction_failed") {
      this.compacting = false;
      this.notify();
      return;
    }
    if (event.type === "compacted") {
      this.compacting = false;
      this.applyCompaction(event.summary, event.firstKeptIndex, event.tokensBefore);
      this.notify();
      if (this.current?.session.compaction) {
        void this.sessions.save(this.current.session);
      }
      return;
    }

    const assistant = this.latestAssistant();
    if (!assistant) {
      return;
    }
    switch (event.type) {
      case "text_delta":
        applyTextDelta(assistant, event.text);
        if (isThinkingOpen(assistant)) {
          this.scheduleThinkingIdle();
        }
        break;
      case "thinking_start":
        this.clearThinkingIdle();
        applyThinkingStart(assistant);
        break;
      case "thinking_delta":
        this.clearThinkingIdle();
        applyThinkingDelta(assistant, event.text);
        break;
      case "thinking_end":
        this.clearThinkingIdle();
        applyThinkingEnd(assistant);
        break;
      case "tool_started":
        this.clearThinkingIdle();
        applyToolStarted(assistant, {
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
        });
        break;
      case "tool_completed":
        this.clearThinkingIdle();
        applyToolCompleted(assistant, event.toolCallId, event.result, event.isError);
        break;
      case "error":
        this.clearThinkingIdle();
        this.error = event.message;
        applyAssistantError(assistant, event.message);
        break;
      case "turn_completed":
        if (event.usage) {
          assistant.usage = event.usage;
        }
        break;
    }
    this.notify();
  }

  private applyCompaction(summary: string, firstKeptIndex?: number, tokensBefore?: number): void {
    const session = this.current?.session;
    if (!session || session.messages.length === 0) {
      return;
    }
    const kept =
      firstKeptIndex !== undefined
        ? (session.messages[firstKeptIndex] ?? session.messages.at(-1))
        : session.messages.at(-1);
    if (!kept) {
      return;
    }
    session.compaction = {
      summary,
      firstKeptMessageId: kept.id,
      createdAt: new Date().toISOString(),
      ...(tokensBefore !== undefined ? { tokensBefore } : {}),
    };
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

  private requireSession(): PidianSession {
    if (!this.current) {
      throw new Error("No active chat session.");
    }
    return this.current.session;
  }

  private async disposeCurrent(): Promise<void> {
    this.clearThinkingIdle();
    this.current?.unsubscribe();
    await this.current?.agent?.dispose();
    this.current = undefined;
    this.streaming = false;
    this.compacting = false;
  }

  private scheduleThinkingIdle(): void {
    this.clearThinkingIdle();
    this.thinkingIdleTimer = setTimeout(() => {
      this.thinkingIdleTimer = undefined;
      const assistant = this.latestAssistant();
      if (!assistant) {
        return;
      }
      applyThinkingIdle(assistant);
      this.notify();
    }, THINKING_IDLE_MS);
  }

  private clearThinkingIdle(): void {
    if (this.thinkingIdleTimer === undefined) {
      return;
    }
    clearTimeout(this.thinkingIdleTimer);
    this.thinkingIdleTimer = undefined;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
