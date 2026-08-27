import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";

export interface ContextProvider {
  getActiveNote(): ContextSnapshot | undefined;
}

export class ContextService {
  constructor(
    private readonly provider: ContextProvider,
    private readonly getIncludeSelection: () => boolean,
  ) {}

  snapshot(): ContextSnapshot | undefined {
    const raw = this.provider.getActiveNote();
    if (!raw) {
      return undefined;
    }
    if (!this.getIncludeSelection()) {
      return {
        notePath: raw.notePath,
        noteContent: raw.noteContent,
      };
    }
    return raw;
  }
}

export function formatAgentPrompt(text: string, context?: ContextSnapshot): string {
  if (!context) {
    return text;
  }

  const parts = [
    `Current note:\n${context.notePath}`,
    `Current note content:\n${context.noteContent}`,
  ];

  if (context.selection) {
    parts.push(
      `Focused selection:\nLines ${context.selection.startLine}-${context.selection.endLine}`,
    );
    parts.push(`Context around selection:\n${context.selection.excerpt}`);
    parts.push(`Selected text:\n${context.selection.text}`);
  }

  parts.push(text);
  return parts.join("\n\n");
}
