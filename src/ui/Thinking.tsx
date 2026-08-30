import { useState, type JSX } from "react";
import { t } from "../i18n";

const SPINNER_DOTS = 8;

export function Spinner(): JSX.Element {
  return (
    <span className="pidian-spinner" role="status" aria-label={t("uiThinking")}>
      {Array.from({ length: SPINNER_DOTS }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

export function Thinking({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="pidian-thinking">
      <button className="pidian-disclosure" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{t("uiThinking")}</span>
      </button>
      {open ? <pre className="pidian-thinking-body">{text}</pre> : null}
    </div>
  );
}
