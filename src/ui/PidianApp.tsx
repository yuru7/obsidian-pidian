import { useEffect, useReducer, useRef, useState, type JSX } from "react";
import type { Scope } from "obsidian";
import { formatLineRange } from "../application/activeMarkdown";
import { hasContextLineRange } from "../domain/notes/ContextSnapshot";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { sumTokenUsage, type PidianMessage } from "../domain/sessions/PidianSession";
import { Chat, type ChatHandle } from "./Chat";
import { Composer, type ComposerHandle } from "./Composer";
import { ModelSelector } from "./ModelSelector";
import { OpenActiveSessionButton } from "./OpenActiveSessionButton";
import { SessionSelector } from "./SessionSelector";
import { Spinner } from "./Thinking";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { useOverflowMarquee } from "./useOverflowMarquee";

function fileNameFromPath(notePath: string): string {
  return notePath.split("/").pop() || notePath;
}

export function PidianApp({ plugin, keymapScope }: { plugin: PidianPlugin; keymapScope: Scope | null }): JSX.Element {
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const chatRef = useRef<ChatHandle>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const sessionId = plugin.agentService?.getSession()?.id;

  useEffect(() => {
    const unsubAgent = plugin.agentService?.subscribe(() => rerender());
    const unsubSettings = plugin.subscribeSettings(() => rerender());
    return () => {
      unsubAgent?.();
      unsubSettings();
    };
  }, [plugin]);

  useEffect(() => {
    setNearBottom(true);
  }, [sessionId]);

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
            <OpenActiveSessionButton plugin={plugin} />
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
        sendWithCtrlEnter={plugin.settings.sendWithCtrlEnter}
        editDisabled={streaming || agent.isCompacting() || !session?.provider || !session?.model}
        editToolbar={<ModelSelector plugin={plugin} onChange={rerender} />}
        onNearBottomChange={setNearBottom}
        onFork={(messageId) => {
          void agent.forkFrom(messageId).catch((error: unknown) => {
            console.error("Pidian: failed to fork session", error);
          });
        }}
        onResend={(messageId, text) => {
          void agent.editAndResend(messageId, text).catch((error: unknown) => {
            console.error("Pidian: failed to resend message", error);
          });
        }}
        onQuote={(text) => {
          composerRef.current?.insertQuote(text);
        }}
      />
      {error ? <div className="pidian-error">{error}</div> : null}
      <footer className="pidian-footer">
        {streaming || !nearBottom ? (
          <div className="pidian-streaming-indicator">
            <button
              type="button"
              className={
                streaming ? "pidian-streaming-scroll" : "pidian-streaming-scroll pidian-jump-to-bottom"
              }
              aria-label={t("uiScrollToLatest")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                chatRef.current?.scrollToBottom();
              }}
            >
              {streaming ? (
                <Spinner decorative />
              ) : (
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
                  <circle cx="12" cy="12" r="10" />
                  <path d="m8 12 4 4 4-4" />
                  <path d="M12 8v8" />
                </svg>
              )}
            </button>
          </div>
        ) : null}
        <div className="pidian-footer-meta">
          <ContextPreview plugin={plugin} />
          <TokenUsage messages={session?.messages ?? []} />
        </div>
        <Composer
          ref={composerRef}
          plugin={plugin}
          keymapScope={keymapScope}
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
  return <TokenUsageDisplay usage={sumTokenUsage(messages)} label={t("uiTotalTokens")} />;
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
  const lineLabel = hasContextLineRange(context)
    ? `[${formatLineRange(context)}]`
    : undefined;
  return (
    <div className="pidian-context">
      <ContextFileName fileName={fileName} />
      {lineLabel ? <span className="pidian-context-line">{lineLabel}</span> : null}
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
