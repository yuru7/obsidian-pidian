import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";

export interface ContextProvider {
  getActiveNote(): ContextSnapshot | undefined;
}

export class ContextService {
  constructor(private readonly provider: ContextProvider) {}

  snapshot(): ContextSnapshot | undefined {
    return this.provider.getActiveNote();
  }
}

export function formatAgentPrompt(text: string, context?: ContextSnapshot): string {
  if (!context) {
    return text;
  }

  const location =
    context.startLine === context.endLine
      ? `Cursor:\nLine ${context.startLine}`
      : `Selection:\nLines ${context.startLine}-${context.endLine}`;

  return [`Current note:\n${context.notePath}`, location, text].join("\n\n");
}
