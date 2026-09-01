import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { locale, t } from "../i18n";
import type PidianPlugin from "../main";
import { NEW_CHAT_TITLE } from "../application/sessionTitle";
import type { SessionSummary } from "../domain/sessions/PidianSession";

const BALLOON_WIDTH = 280;
const BALLOON_GAP = 8;
const BALLOON_PAD = 8;
const BALLOON_HIDE_MS = 150;

type BalloonPos = {
  top: number;
  left: number;
  side: "left" | "right";
};

export function SessionSelector({
  plugin,
  onChange,
}: {
  plugin: PidianPlugin;
  onChange: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const balloonRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [balloonPos, setBalloonPos] = useState<BalloonPos | null>(null);
  const activeId = plugin.agentService?.getSession()?.id;
  const hovered = sessions.find((session) => session.id === hoveredId);

  useEffect(() => {
    if (!open) {
      return;
    }
    const sessionService = plugin.sessionService;
    if (!sessionService) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void sessionService
      .list()
      .then((list) => {
        if (!cancelled) {
          setSessions(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, plugin]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || balloonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    window.clearTimeout(hideTimer.current);
    setHoveredId(null);
    setBalloonPos(null);
  }, [open]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useLayoutEffect(() => {
    const el = balloonRef.current;
    if (!el || !balloonPos) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const nextTop =
      rect.bottom > window.innerHeight - BALLOON_PAD
        ? Math.max(BALLOON_PAD, window.innerHeight - BALLOON_PAD - rect.height)
        : balloonPos.top;
    const nextLeft =
      rect.right > window.innerWidth - BALLOON_PAD
        ? Math.max(BALLOON_PAD, window.innerWidth - BALLOON_PAD - rect.width)
        : balloonPos.left;
    if (nextTop === balloonPos.top && nextLeft === balloonPos.left) {
      return;
    }
    setBalloonPos({ ...balloonPos, top: nextTop, left: nextLeft });
  }, [balloonPos, hoveredId]);

  const showBalloon = (sessionId: string, item: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    setHoveredId(sessionId);
    setBalloonPos(placeSessionBalloon(item));
  };

  const hideBalloon = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setHoveredId(null);
      setBalloonPos(null);
    }, BALLOON_HIDE_MS);
  };

  const dismissBalloon = () => {
    window.clearTimeout(hideTimer.current);
    setHoveredId(null);
    setBalloonPos(null);
  };

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
        <div className="pidian-session-menu" onScroll={dismissBalloon}>
          {loading && sessions.length === 0 ? (
            <div className="pidian-session-empty">{t("uiLoadingSessions")}</div>
          ) : sessions.length === 0 ? (
            <div className="pidian-session-empty">{t("uiNoSessions")}</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                className={`pidian-session-item${session.id === activeId ? " is-selected" : ""}`}
                aria-current={session.id === activeId ? "true" : undefined}
                onPointerEnter={(event) => showBalloon(session.id, event.currentTarget)}
                onPointerLeave={hideBalloon}
                onClick={() => {
                  void plugin.openSession(session.id).then(() => {
                    setOpen(false);
                    onChange();
                  });
                }}
              >
                <div className="pidian-session-title">{sessionTitle(session.title)}</div>
                <div className="pidian-session-meta">
                  {formatTime(session.updatedAt)} · {session.provider}/{session.model}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
      {hovered && balloonPos
        ? createPortal(
            // Menu overflow would clip an in-list balloon, so this is rendered on body.
            <div
              ref={balloonRef}
              className={`pidian-session-balloon is-${balloonPos.side}`}
              role="tooltip"
              style={{ top: balloonPos.top, left: balloonPos.left, width: BALLOON_WIDTH }}
              onPointerEnter={() => window.clearTimeout(hideTimer.current)}
              onPointerLeave={hideBalloon}
            >
              <div className="pidian-session-balloon-query">{balloonQuery(hovered)}</div>
              <div className="pidian-session-balloon-meta">
                <div>{formatTime(hovered.updatedAt)}</div>
                <div className="pidian-session-balloon-model">
                  {hovered.provider}/{hovered.model}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function balloonQuery(session: SessionSummary): string {
  return session.firstQuery.trim() ? session.firstQuery : sessionTitle(session.title);
}

function placeSessionBalloon(item: HTMLElement): BalloonPos {
  const rect = item.getBoundingClientRect();
  const placeLeft = rect.left >= BALLOON_WIDTH + BALLOON_GAP + BALLOON_PAD;
  return {
    top: Math.max(BALLOON_PAD, rect.top),
    left: placeLeft ? rect.left - BALLOON_WIDTH - BALLOON_GAP : rect.right + BALLOON_GAP,
    side: placeLeft ? "left" : "right",
  };
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
