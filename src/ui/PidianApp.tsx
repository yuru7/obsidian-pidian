import { useEffect, useReducer, useRef, useState } from "react";
import { formatLineRange } from "../application/activeMarkdown";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { sumTokenUsage, type PidianMessage } from "../domain/sessions/PidianSession";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { ModelSelector } from "./ModelSelector";
import { SessionSelector } from "./SessionSelector";
import { Spinner } from "./Thinking";

function formatContextLabel(notePath: string, startLine: number, endLine: number): string {
  const fileName = notePath.split("/").pop() || notePath;
  return `${fileName} [${formatLineRange(startLine, endLine)}]`;
}

export function PidianApp({ plugin }: { plugin: PidianPlugin }): JSX.Element {
  const [, rerender] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    return plugin.agentService?.subscribe(() => rerender());
  }, [plugin]);

  if (!plugin.agentService) {
    return (
      <div className="pidian-root">
        <div className="pidian-error">{t("uiNotInitialized")}</div>
      </div>
    );
  }

  const agent = plugin.agentService;
  const session = agent.getSession();
  const streaming = agent.isStreaming();
  const error = agent.getError();

  return (
    <div className="pidian-root">
      <header className="pidian-header">
        <div className="pidian-header-row">
          <div className="pidian-title">Pidian</div>
          <div className="pidian-header-actions">
            <button
              className="pidian-icon-button"
              aria-label={t("uiNewChat")}
              onClick={() => {
                void plugin.startNewChat();
              }}
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
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </button>
            <SessionSelector plugin={plugin} onChange={rerender} />
          </div>
        </div>
      </header>
      <Chat app={plugin.app} messages={session?.messages ?? []} />
      {error ? <div className="pidian-error">{error}</div> : null}
      <footer className="pidian-footer">
        {streaming ? (
          <div className="pidian-streaming-indicator">
            <Spinner />
          </div>
        ) : null}
        <div className="pidian-footer-meta">
          <ContextPreview plugin={plugin} />
          <TokenUsage messages={session?.messages ?? []} />
        </div>
        <Composer
          disabled={!session}
          streaming={streaming}
          toolbar={<ModelSelector plugin={plugin} onChange={rerender} />}
          onSend={(text) => {
            void agent.send(text);
          }}
          onAbort={() => {
            void agent.abort();
          }}
        />
      </footer>
    </div>
  );
}

function TokenUsage({ messages }: { messages: PidianMessage[] }): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const usage = sumTokenUsage(messages);

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
    <div
      ref={rootRef}
      className={`pidian-token-selector${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="pidian-model-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="pidian-model-trigger-label">{t("uiTokens")}</span>
        <span className="pidian-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="pidian-model-balloon" role="dialog">
          <div className="pidian-model-row">
            <span>{t("uiTokenRead")}</span>
            <span className="pidian-token-value">{usage.input}</span>
          </div>
          <div className="pidian-model-row">
            <span>{t("uiTokenCacheRead")}</span>
            <span className="pidian-token-value">{usage.cacheRead}</span>
          </div>
          <div className="pidian-model-row">
            <span>{t("uiTokenWrite")}</span>
            <span className="pidian-token-value">{usage.output}</span>
          </div>
          <div className="pidian-model-row">
            <span>{t("uiTokenCacheWrite")}</span>
            <span className="pidian-token-value">{usage.cacheWrite}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContextPreview({ plugin }: { plugin: PidianPlugin }): JSX.Element {
  const [, rerender] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const onChange = () => rerender();
    const unsubEditor = plugin.subscribeEditorContext(onChange);
    const workspace = plugin.app.workspace;
    const refs = [
      workspace.on("active-leaf-change", onChange),
      workspace.on("file-open", onChange),
    ];
    return () => {
      unsubEditor();
      for (const ref of refs) {
        workspace.offref(ref);
      }
    };
  }, [plugin]);

  const context = plugin.agentService?.getContextPreview();
  if (!context) {
    return <div className="pidian-context pidian-context-empty">{t("uiNoActiveNote")}</div>;
  }
  return (
    <div className="pidian-context">
      {formatContextLabel(context.notePath, context.startLine, context.endLine)}
    </div>
  );
}
