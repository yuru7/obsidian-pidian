export function workedSeconds(workedMs: number): number {
  return Math.max(1, Math.round(workedMs / 1000));
}
