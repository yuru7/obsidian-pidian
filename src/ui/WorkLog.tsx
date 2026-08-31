import { useState, type JSX, type ReactNode } from "react";
import { t } from "../i18n";
import { workedSeconds } from "./workedSeconds";

export function WorkLog({
  streaming,
  workedMs,
  children,
}: {
  streaming: boolean;
  workedMs?: number;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const working = streaming && workedMs === undefined;

  const label = workedMs !== undefined
    ? t("uiWorkedFor", { seconds: workedSeconds(workedMs) })
    : working
      ? t("uiWorking")
      : t("uiWorked");

  return (
    <div className="pidian-work-log">
      <button
        type="button"
        className="pidian-disclosure"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span className={working ? "pidian-working" : undefined}>{label}</span>
      </button>
      {open ? <div className="pidian-work-log-items">{children}</div> : null}
    </div>
  );
}
