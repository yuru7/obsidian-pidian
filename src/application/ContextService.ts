import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";
import { formatLineRange } from "./activeMarkdown";

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
  const user = `User: ${text}`;
  if (!context) {
    return user;
  }

  const lineRange = formatLineRange(context.startLine, context.endLine);
  return `${context.notePath} ${lineRange}\n${user}`;
}
