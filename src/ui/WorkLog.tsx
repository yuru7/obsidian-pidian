import { useState, type JSX, type ReactNode } from "react";
import { t } from "../i18n";
import { Spinner } from "./Thinking";
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

  const label = streaming
    ? t("uiWorking")
    : workedMs === undefined
      ? t("uiWorked")
      : t("uiWorkedFor", { seconds: workedSeconds(workedMs) });

  return (
    <div className="pidian-work-log">
      <button
        type="button"
        className="pidian-disclosure"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>{label}</span>
        {streaming ? <Spinner decorative /> : null}
      </button>
      {open ? <div className="pidian-work-log-items">{children}</div> : null}
    </div>
  );
}
