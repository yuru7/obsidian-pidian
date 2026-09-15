const MIN_DISPLAY_USD = 0.001;

/** Compact USD amount: `3`, `0.1`, `0.01`. Values below 0.001 (except 0) are `0.001>`. */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return "0";
  }
  if (amount > 0 && amount < MIN_DISPLAY_USD) {
    return "0.001>";
  }
  return amount.toFixed(3).replace(/\.?0+$/, "");
}
