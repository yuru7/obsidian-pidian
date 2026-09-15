export function doneDuration(durationMs: number): { minutes: number; seconds: number } {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}
