import { useState } from "react";
import { t } from "../i18n";

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
