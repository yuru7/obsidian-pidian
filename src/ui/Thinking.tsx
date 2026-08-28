import { useEffect, useState } from "react";
import { t } from "../i18n";

const DOT_INTERVAL_MS = 600;
const MAX_DOTS = 5;

function useThinkingDots(active: boolean): string {
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    setCount(1);
    const id = window.setInterval(() => {
      setCount((value) => (value === MAX_DOTS ? 1 : value + 1));
    }, DOT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return ".".repeat(count);
}

function ThinkingLabel({ waiting }: { waiting: boolean }): JSX.Element {
  const dots = useThinkingDots(waiting);
  if (!waiting) {
    return <>{t("uiThinking")}</>;
  }
  return (
    <>
      {t("uiThinkingWait")}
      <span className="pidian-thinking-dots" aria-hidden="true">
        {dots}
      </span>
    </>
  );
}

export function ThinkingWait(): JSX.Element {
  return (
    <div className="pidian-thinking-wait" aria-live="polite">
      <ThinkingLabel waiting />
    </div>
  );
}

export function Thinking({ text, waiting }: { text: string; waiting?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="pidian-thinking">
      <button className="pidian-disclosure" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>
          <ThinkingLabel waiting={Boolean(waiting)} />
        </span>
      </button>
      {open ? <pre className="pidian-thinking-body">{text}</pre> : null}
    </div>
  );
}
