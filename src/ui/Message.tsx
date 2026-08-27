import { useEffect, useState } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Markdown } from "./Markdown";
import { Thinking } from "./Thinking";
import { ToolCall } from "./ToolCall";

export function Message({ app, message }: { app: App; message: PidianMessage }): JSX.Element {
  const name = message.role === "user" ? t("uiYou") : "Pidian";
  const assistant = message.role === "assistant";
  return (
    <article className={`pidian-message pidian-message-${message.role}`}>
      <div className="pidian-message-role">{name}</div>
      {message.thinking ? <Thinking text={message.thinking} /> : null}
      {message.toolCalls?.map((toolCall) => (
        <ToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
      {message.text ? <Markdown app={app} markdown={message.text} /> : null}
      {assistant && message.text ? <CopyButton markdown={message.text} /> : null}
    </article>
  );
}

function CopyButton({ markdown }: { markdown: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="pidian-message-actions">
      <button
        type="button"
        className="pidian-icon-button pidian-copy-button"
        aria-label={copied ? t("uiCopied") : t("uiCopy")}
        title={copied ? t("uiCopied") : t("uiCopy")}
        onClick={() => {
          void navigator.clipboard.writeText(markdown).then(
            () => setCopied(true),
            (error: unknown) => {
              console.error("Pidian: failed to copy response", error);
            },
          );
        }}
      >
        {copied ? (
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
            <path d="M20 6 9 17l-5-5" />
          </svg>
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
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>
    </div>
  );
}
