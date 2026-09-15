import type { JSX } from "react";
import { t } from "../i18n";
import type { TokenUsageCost } from "../domain/agent/tokenCost";
import type { TokenUsage } from "../domain/sessions/PidianSession";
import { formatUsd } from "./formatUsd";

function tokenValue(count: number, amount: number | undefined): string {
  if (amount === undefined) {
    return String(count);
  }
  return `${count} ($${formatUsd(amount)})`;
}

export function TokenUsageDisplay({
  usage,
  cost,
  label,
  variant = "footer",
}: {
  usage: TokenUsage;
  cost?: TokenUsageCost;
  label: string;
  variant?: "footer" | "message";
}): JSX.Element {
  const triggerClass =
    variant === "message" ? "pidian-icon-button pidian-token-button" : "pidian-model-trigger";
  return (
    <div
      className={
        variant === "message" ? "pidian-token-selector pidian-message-token-selector" : "pidian-token-selector"
      }
    >
      <button type="button" className={triggerClass} aria-label={label}>
        <svg
          className="pidian-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="7.5" y="2" width="9" height="9" rx="2" />
          <rect x="2" y="13" width="9" height="9" rx="2" />
          <rect x="13" y="13" width="9" height="9" rx="2" />
        </svg>
      </button>
      <div className="pidian-model-balloon" role="tooltip">
        <div className="pidian-token-balloon-title">{label}</div>
        <div className="pidian-model-row">
          <span>{t("uiTokenRead")}</span>
          <span className="pidian-token-value">{tokenValue(usage.input, cost?.input)}</span>
        </div>
        <div className="pidian-model-row">
          <span>{t("uiTokenCacheRead")}</span>
          <span className="pidian-token-value">{tokenValue(usage.cacheRead, cost?.cacheRead)}</span>
        </div>
        <div className="pidian-model-row">
          <span>{t("uiTokenWrite")}</span>
          <span className="pidian-token-value">{tokenValue(usage.output, cost?.output)}</span>
        </div>
        <div className="pidian-model-row">
          <span>{t("uiTokenCacheWrite")}</span>
          <span className="pidian-token-value">{tokenValue(usage.cacheWrite, cost?.cacheWrite)}</span>
        </div>
      </div>
    </div>
  );
}
