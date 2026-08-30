import { useEffect, useReducer, type JSX } from "react";
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
    const unsubAgent = plugin.agentService?.subscribe(() => rerender());
    const unsubSettings = plugin.subscribeSettings(() => rerender());
    return () => {
      unsubAgent?.();
      unsubSettings();
    };
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
          disabled={!session || !session.provider || !session.model}
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
  const usage = sumTokenUsage(messages);
  return (
    <div className="pidian-token-selector">
      <span className="pidian-model-trigger">
        <span className="pidian-model-trigger-label">{t("uiTokens")}</span>
        <span className="pidian-caret" aria-hidden="true" />
      </span>
      <div className="pidian-model-balloon" role="tooltip">
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
