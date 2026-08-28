export interface ContextSnapshot {
  notePath: string;
  /** 1-based inclusive start line of the cursor or selection. */
  startLine: number;
  /** 1-based inclusive end line of the cursor or selection. */
  endLine: number;
}
