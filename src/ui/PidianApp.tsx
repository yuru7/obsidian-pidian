import { useEffect, useReducer } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { Chat } from "./Chat";
import { Composer } from "./Composer";
import { ModelSelector } from "./ModelSelector";
import { SessionSelector } from "./SessionSelector";

function formatContextLabel(
  notePath: string,
  selection?: { startLine: number; endLine: number },
): string {
  const fileName = notePath.split("/").pop() || notePath;
  if (!selection) {
    return fileName;
  }
  const range =
    selection.startLine === selection.endLine
      ? `L${selection.startLine}`
      : `L${selection.startLine}-L${selection.endLine}`;
  return `${fileName} [${range}]`;
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
      <Chat messages={session?.messages ?? []} />
      {error ? <div className="pidian-error">{error}</div> : null}
      <footer className="pidian-footer">
        <ContextPreview plugin={plugin} />
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
    <div className="pidian-context">{formatContextLabel(context.notePath, context.selection)}</div>
  );
}
