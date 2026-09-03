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

/** Pi in-memory sessions kept after a query. Opening a chat does not occupy a slot. */
export const MAX_IN_MEMORY_SESSIONS = 3;

type SessionSlot = {
  session: PidianSession;
  agent?: AgentSession;
  unsubscribe: () => void;
};

export class AgentService {
  private current?: SessionSlot;
  /** Insertion order is LRU: oldest queried first, most recently queried last. */
  private readonly live = new Map<string, SessionSlot>();
  private streaming = false;
  private compacting = false;
  private error?: string;
  private thinkingIdleTimer: number | undefined;
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
    await this.parkCurrent();
    const session = this.sessions.create(provider, model, thinkingLevel);
    this.current = {
      session,
      unsubscribe: () => undefined,
    };
    this.error = undefined;
    this.notify();
    return session;
  }

  async forkFrom(messageId: string): Promise<PidianSession> {
    if (this.streaming) {
      throw new Error("The agent is already responding.");
    }
    const source = this.requireSession();
    const session = this.sessions.fork(source, messageId);
    await this.parkCurrent();
    this.current = {
      session,
      unsubscribe: () => undefined,
    };
    this.error = undefined;
    await this.sessions.save(session);
    this.notify();
    return session;
  }

  async openChat(id: string): Promise<PidianSession> {
    const live = this.live.get(id);
    if (live) {
      await this.showSlot(live);
      return live.session;
    }
    if (this.current?.session.id === id) {
      return this.current.session;
    }
    const loaded = await this.sessions.load(id);
    if (!loaded) {
      throw new Error(`Session not found: ${id}`);
    }
    await this.showSession(loaded);
    return loaded;
  }

  async restoreChat(session: PidianSession): Promise<PidianSession> {
    const live = this.live.get(session.id);
    if (live) {
      await this.showSlot(live);
      return live.session;
    }
    if (this.current?.session.id === session.id) {
      return this.current.session;
    }
    await this.showSession(session);
    return session;
  }

  async setModel(provider: string, model: string, thinkingLevel?: string): Promise<void> {
    const slot = this.requireSlot();
    const session = slot.session;
    const nextThinking = thinkingLevel ?? session.thinkingLevel;
    if (session.provider === provider && session.model === model && session.thinkingLevel === nextThinking) {
      return;
    }
    session.provider = provider;
    session.model = model;
    session.thinkingLevel = nextThinking;
    if (session.messages.length > 0) {
      await this.sessions.save(session);
    }
    if (slot.agent) {
      await this.recreateAgent();
    }
    this.notify();
  }

  async reloadModel(): Promise<void> {
    for (const slot of this.live.values()) {
      await this.replaceAgent(slot, slot === this.current);
    }
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
    const slot = this.requireSlot();
    const session = slot.session;
    if (this.streaming) {
      throw new Error("The agent is already responding.");
    }

    let agent: AgentSession;
    try {
      agent = await this.ensureAgent();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.notify();
      return;
    }
    await this.keepLive();

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
      await agent.prompt({
        text: formatAgentPrompt(trimmed, snapshot, userMessage.createdAt),
        context: snapshot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.current?.session.id === session.id) {
        this.error = message;
      }
      const failed = this.latestAssistant(session);
      if (failed) {
        applyAssistantError(failed, message);
      }
      this.notify();
    } finally {
      this.clearThinkingIdle();
      if (this.current?.session.id === session.id) {
        this.streaming = false;
      }
      const assistant = this.latestAssistant(session);
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
    const slot = this.current;
    if (!slot) {
      return;
    }
    this.live.delete(slot.session.id);
    await this.disposeSlot(slot);
    this.current = undefined;
    this.streaming = false;
    this.compacting = false;
    this.clearThinkingIdle();
    await this.sessions.delete(slot.session.id);
    this.notify();
  }

  async dispose(): Promise<void> {
    this.clearThinkingIdle();
    const slots = new Set(this.live.values());
    if (this.current) {
      slots.add(this.current);
    }
    for (const slot of slots) {
      await this.disposeSlot(slot);
    }
    this.live.clear();
    this.current = undefined;
    this.streaming = false;
    this.compacting = false;
  }

  private async recreateAgent(): Promise<void> {
    const slot = this.requireSlot();
    if (!slot.session.provider || !slot.session.model) {
      await this.replaceAgent(slot, false);
      this.error = undefined;
      return;
    }
    try {
      await this.replaceAgent(slot, true);
      this.error = undefined;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async replaceAgent(slot: SessionSlot, subscribe: boolean): Promise<void> {
    slot.unsubscribe();
    slot.unsubscribe = () => undefined;
    await slot.agent?.dispose();
    slot.agent = undefined;
    if (!slot.session.provider || !slot.session.model) {
      return;
    }
    const agent = await this.createAgent(slot.session);
    slot.agent = agent;
    if (subscribe) {
      slot.unsubscribe = agent.subscribe((event) => this.handleEvent(event));
    }
  }

  private async ensureAgent(): Promise<AgentSession> {
    const slot = this.requireSlot();
    if (slot.agent) {
      return slot.agent;
    }
    const agent = await this.createAgent(slot.session);
    slot.agent = agent;
    slot.unsubscribe();
    slot.unsubscribe = agent.subscribe((event) => this.handleEvent(event));
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

  private latestAssistant(session = this.current?.session): PidianMessage | undefined {
    const messages = session?.messages;
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

  private requireSlot(): SessionSlot {
    if (!this.current) {
      throw new Error("No active chat session.");
    }
    return this.current;
  }

  private requireSession(): PidianSession {
    return this.requireSlot().session;
  }

  private async showSlot(slot: SessionSlot): Promise<void> {
    if (this.current === slot) {
      return;
    }
    await this.parkCurrent();
    this.current = slot;
    this.error = undefined;
    this.subscribeCurrent();
    this.notify();
  }

  private async showSession(session: PidianSession): Promise<void> {
    await this.parkCurrent();
    this.current = {
      session,
      unsubscribe: () => undefined,
    };
    this.error = undefined;
    this.notify();
  }

  private subscribeCurrent(): void {
    const slot = this.current;
    if (!slot?.agent) {
      return;
    }
    slot.unsubscribe();
    slot.unsubscribe = slot.agent.subscribe((event) => this.handleEvent(event));
  }

  private async parkCurrent(): Promise<void> {
    this.clearThinkingIdle();
    const slot = this.current;
    if (!slot) {
      this.streaming = false;
      this.compacting = false;
      return;
    }
    slot.unsubscribe();
    slot.unsubscribe = () => undefined;
    if (this.streaming) {
      await slot.agent?.abort();
      this.streaming = false;
    }
    this.compacting = false;
    if (!this.live.has(slot.session.id)) {
      await this.disposeSlot(slot);
    }
  }

  private async keepLive(): Promise<void> {
    const slot = this.requireSlot();
    this.live.delete(slot.session.id);
    this.live.set(slot.session.id, slot);
    const currentId = slot.session.id;
    while (this.live.size > MAX_IN_MEMORY_SESSIONS) {
      const victimId = oldestLiveId(this.live, currentId);
      if (!victimId) {
        break;
      }
      const victim = this.live.get(victimId);
      this.live.delete(victimId);
      if (victim) {
        await this.disposeSlot(victim);
      }
    }
  }

  private async disposeSlot(slot: SessionSlot): Promise<void> {
    slot.unsubscribe();
    slot.unsubscribe = () => undefined;
    await slot.agent?.dispose();
    slot.agent = undefined;
  }

  private scheduleThinkingIdle(): void {
    this.clearThinkingIdle();
    this.thinkingIdleTimer = window.setTimeout(() => {
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
    window.clearTimeout(this.thinkingIdleTimer);
    this.thinkingIdleTimer = undefined;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function oldestLiveId(live: Map<string, SessionSlot>, except: string): string | undefined {
  for (const id of live.keys()) {
    if (id !== except) {
      return id;
    }
  }
  return undefined;
}
