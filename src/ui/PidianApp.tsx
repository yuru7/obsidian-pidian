import { useEffect, useReducer, useRef, type JSX } from "react";
import { formatLineRange } from "../application/activeMarkdown";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { sumTokenUsage, type PidianMessage } from "../domain/sessions/PidianSession";
import { Chat, type ChatHandle } from "./Chat";
import { Composer } from "./Composer";
import { ModelSelector } from "./ModelSelector";
import { SessionSelector } from "./SessionSelector";
import { Spinner } from "./Thinking";
import { useOverflowMarquee } from "./useOverflowMarquee";

function fileNameFromPath(notePath: string): string {
  return notePath.split("/").pop() || notePath;
}

export function PidianApp({ plugin }: { plugin: PidianPlugin }): JSX.Element {
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const chatRef = useRef<ChatHandle>(null);

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
              type="button"
              className="pidian-icon-button"
              aria-label={t("uiNewChat")}
              onMouseDown={(event) => event.preventDefault()}
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
      <Chat
        key={session?.id}
        ref={chatRef}
        app={plugin.app}
        messages={session?.messages ?? []}
        forkedMessageCount={session?.forkedMessageCount}
        compactionFirstKeptMessageId={session?.compaction?.firstKeptMessageId}
        compacting={agent.isCompacting()}
        forkDisabled={streaming}
        streaming={streaming}
        onFork={(messageId) => {
          void agent.forkFrom(messageId).catch((error: unknown) => {
            console.error("Pidian: failed to fork session", error);
          });
        }}
      />
      {error ? <div className="pidian-error">{error}</div> : null}
      <footer className="pidian-footer">
        {streaming ? (
          <div className="pidian-streaming-indicator">
            <button
              type="button"
              className="pidian-streaming-scroll"
              aria-label={t("uiScrollToLatest")}
              title={t("uiScrollToLatest")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                chatRef.current?.scrollToBottom();
              }}
            >
              <Spinner decorative />
            </button>
          </div>
        ) : null}
        <div className="pidian-footer-meta">
          <ContextPreview plugin={plugin} />
          <TokenUsage messages={session?.messages ?? []} />
        </div>
        <Composer
          plugin={plugin}
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
  const label = t("uiTokens");
  return (
    <div className="pidian-token-selector">
      <button type="button" className="pidian-model-trigger" aria-label={label}>
        <svg
          className="pidian-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="7.5" y="2" width="9" height="9" rx="2" />
          <rect x="2" y="13" width="9" height="9" rx="2" />
          <rect x="13" y="13" width="9" height="9" rx="2" />
        </svg>
      </button>
      <div className="pidian-model-balloon" role="tooltip">
        <div className="pidian-token-balloon-title">{label}</div>
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
    const vault = plugin.app.vault;
    const leafChangeRef = workspace.on("active-leaf-change", onChange);
    const fileOpenRef = workspace.on("file-open", onChange);
    const renameRef = vault.on("rename", onChange);
    return () => {
      unsubEditor();
      workspace.offref(leafChangeRef);
      workspace.offref(fileOpenRef);
      vault.offref(renameRef);
    };
  }, [plugin]);

  const context = plugin.agentService?.getContextPreview();
  if (!context) {
    return <div className="pidian-context pidian-context-empty">{t("uiNoActiveNote")}</div>;
  }
  const fileName = fileNameFromPath(context.notePath);
  const lineLabel = `[${formatLineRange(context.startLine, context.endLine)}]`;
  return (
    <div className="pidian-context">
      <ContextFileName fileName={fileName} />
      <span className="pidian-context-line">{lineLabel}</span>
    </div>
  );
}

function ContextFileName({ fileName }: { fileName: string }): JSX.Element {
  const marquee = useOverflowMarquee(fileName);
  return (
    <span
      ref={marquee.viewportRef}
      className="pidian-context-name"
      onPointerEnter={marquee.onPointerEnter}
      onPointerLeave={marquee.onPointerLeave}
    >
      <span ref={marquee.textRef} className="pidian-context-name-text">
        {fileName}
      </span>
    </span>
  );
}
