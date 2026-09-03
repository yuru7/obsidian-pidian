export interface ContextSnapshot {
  notePath: string;
  /** 1-based inclusive start line of the cursor or selection. Omitted when the file has no cursor. */
  startLine?: number;
  /** 1-based inclusive end line of the cursor or selection. Omitted when the file has no cursor. */
  endLine?: number;
  /**
   * 1-based start column of a non-empty editor selection (inclusive).
   * Matches Obsidian `getCursor("from").ch + 1`. Omitted for a collapsed cursor.
   */
  startColumn?: number;
  /**
   * 1-based end column of a non-empty editor selection (exclusive).
   * Matches Obsidian `getCursor("to").ch + 1`. Omitted for a collapsed cursor.
   */
  endColumn?: number;
}

export function hasContextLineRange(
  context: ContextSnapshot,
): context is ContextSnapshot & { startLine: number; endLine: number } {
  return typeof context.startLine === "number" && typeof context.endLine === "number";
}

export function hasContextColumnRange<
  T extends Pick<ContextSnapshot, "startLine" | "endLine" | "startColumn" | "endColumn">,
>(
  context: T,
): context is T & {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
} {
  return (
    typeof context.startLine === "number" &&
    typeof context.endLine === "number" &&
    typeof context.startColumn === "number" &&
    typeof context.endColumn === "number"
  );
}
