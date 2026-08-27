import { useEffect, useReducer } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { ModelSelector } from "./ModelSelector";
import { SessionSelector } from "./SessionSelector";

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
  const context = agent.getContextPreview();

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
              +
            </button>
            <SessionSelector plugin={plugin} onChange={rerender} />
          </div>
        </div>
      </header>
      <Chat messages={session?.messages ?? []} />
      {error ? <div className="pidian-error">{error}</div> : null}
      <footer className="pidian-footer">
        {context ? (
          <div className="pidian-context">
            <div>{context.notePath}</div>
            {context.selection ? (
              <div>
                {t("uiSelectionLines", {
                  start: context.selection.startLine,
                  end: context.selection.endLine,
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="pidian-context pidian-context-empty">{t("uiNoActiveNote")}</div>
        )}
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
