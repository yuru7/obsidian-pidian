import { useEffect, useRef, useState, type JSX } from "react";
import { locale, t } from "../i18n";
import type PidianPlugin from "../main";
import { NEW_CHAT_TITLE } from "../application/sessionTitle";
import type { SessionSummary } from "../domain/sessions/PidianSession";

export function SessionSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const activeId = plugin.agentService?.getSession()?.id;

  useEffect(() => {
    if (!open) {
      return;
    }
    const sessions = plugin.sessionService;
    if (!sessions) {
      setSessions([]);
      return;
    }
    void sessions.list().then(setSessions).catch(() => setSessions([]));
  }, [open, plugin]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="pidian-session-selector">
      <button
        className="pidian-icon-button"
        aria-label={t("uiSessionHistory")}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          className="pidian-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5h16" />
          <path d="M4 12h16" />
          <path d="M4 19h16" />
        </svg>
      </button>
      {open ? (
        <div className="pidian-session-menu">
          {sessions.length === 0 ? (
            <div className="pidian-session-empty">{t("uiNoSessions")}</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                className={`pidian-session-item${session.id === activeId ? " is-selected" : ""}`}
                aria-current={session.id === activeId ? "true" : undefined}
                onClick={() => {
                  void plugin.openSession(session.id).then(() => {
                    setOpen(false);
                    onChange();
                  });
                }}
              >
                <div className="pidian-session-title">{sessionTitle(session.title)}</div>
                <div className="pidian-session-meta">
                  {session.provider}/{session.model} · {formatTime(session.updatedAt)}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function sessionTitle(title: string): string {
  return title === NEW_CHAT_TITLE ? t("uiNewChat") : title;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale());
}
