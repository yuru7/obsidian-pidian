import { useEffect, useState } from "react";
import type PidianPlugin from "../main";
import type { SessionSummary } from "../domain/sessions/PidianSession";

export function SessionSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

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

  return (
    <div className="pidian-session-selector">
      <button
        className="pidian-icon-button"
        aria-label="Session history"
        onClick={() => setOpen((value) => !value)}
      >
        ≡
      </button>
      {open ? (
        <div className="pidian-session-menu">
          {sessions.length === 0 ? (
            <div className="pidian-session-empty">No saved sessions</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                className="pidian-session-item"
                onClick={() => {
                  void plugin.openSession(session.id).then(() => {
                    setOpen(false);
                    onChange();
                  });
                }}
              >
                <div className="pidian-session-title">{session.title}</div>
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

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
