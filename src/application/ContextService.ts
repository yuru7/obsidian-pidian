import { hasContextLineRange, type ContextSnapshot } from "../domain/notes/ContextSnapshot";
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

/** Local-offset ISO 8601 without milliseconds, e.g. `2026-08-31T17:31:00+09:00`. */
export function formatLocalIso8601(createdAt: string): string | undefined {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

export function formatAgentPrompt(text: string, context?: ContextSnapshot, createdAt?: string): string {
  const lines: string[] = [];
  const sentAt = createdAt ? formatLocalIso8601(createdAt) : undefined;
  if (sentAt) {
    lines.push(sentAt);
  }
  if (context) {
    lines.push(
      hasContextLineRange(context)
        ? `${context.notePath} ${formatLineRange(context)}`
        : context.notePath,
    );
  }
  lines.push(`User: ${text}`);
  return lines.join("\n");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
