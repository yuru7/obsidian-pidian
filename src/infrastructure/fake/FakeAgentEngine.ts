import type { AgentEngine, AgentSessionOptions } from "../../domain/agent/AgentEngine";
import type { AgentEventListener } from "../../domain/agent/AgentEvent";
import type { AgentPrompt, AgentSession } from "../../domain/agent/AgentSession";

export class FakeAgentEngine implements AgentEngine {
  async createSession(_options: AgentSessionOptions): Promise<AgentSession> {
    return new FakeAgentSession();
  }
}

class FakeAgentSession implements AgentSession {
  private readonly listeners = new Set<AgentEventListener>();

  async prompt(request: AgentPrompt): Promise<void> {
    const reply = `Echo: ${request.text.split("\n").at(-1) ?? request.text}`;
    for (const char of reply) {
      this.emit({ type: "text_delta", text: char });
    }
    this.emit({ type: "turn_completed" });
  }

  async abort(): Promise<void> {}

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
  }

  private emit(...events: Parameters<AgentEventListener>[0][]): void {
    for (const event of events) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }
}
