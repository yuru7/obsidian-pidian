export interface ContextSnapshot {
  notePath: string;
  /** 1-based inclusive start line of the cursor or selection. Omitted when the file has no cursor. */
  startLine?: number;
  /** 1-based inclusive end line of the cursor or selection. Omitted when the file has no cursor. */
  endLine?: number;
}

export function hasContextLineRange(
  context: ContextSnapshot,
): context is ContextSnapshot & { startLine: number; endLine: number } {
  return typeof context.startLine === "number" && typeof context.endLine === "number";
}
