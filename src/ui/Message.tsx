import { useEffect, useState } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Markdown } from "./Markdown";
import { Thinking } from "./Thinking";
import { ToolCall } from "./ToolCall";

export function Message({
  app,
  message,
}: {
  app: App;
  message: PidianMessage;
}): JSX.Element {
  const name = message.role === "user" ? t("uiYou") : "Pidian";
  const assistant = message.role === "assistant";
  return (
    <article className={`pidian-message pidian-message-${message.role}`}>
      <div className="pidian-message-role">
        {message.role === "user" ? <YouIcon /> : <PidianIcon />}
        {name}
      </div>
      {message.thinking ? <Thinking text={message.thinking} /> : null}
      {message.toolCalls?.map((toolCall) => (
        <ToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
      {message.text ? <Markdown app={app} markdown={message.text} /> : null}
      {assistant && message.text ? <CopyButton markdown={message.text} /> : null}
    </article>
  );
}

function YouIcon(): JSX.Element {
  return (
    <svg
      className="pidian-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 8C6 4.68629 8.68629 2 12 2C15.3137 2 18 4.68629 18 8C18 11.3137 15.3137 14 12 14C8.68629 14 6 11.3137 6 8Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.43094 16.9025C7.05587 16.2213 9.2233 16 12 16C14.771 16 16.9351 16.2204 18.5586 16.8981C20.3012 17.6255 21.3708 18.8613 21.941 20.6587C22.1528 21.3267 21.6518 22 20.9592 22H3.03459C2.34482 22 1.84679 21.3297 2.0569 20.6654C2.62537 18.8681 3.69119 17.6318 5.43094 16.9025Z"
      />
    </svg>
  );
}

function PidianIcon(): JSX.Element {
  return (
    <svg
      className="pidian-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -64 640 640"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M32,224H64V416H32A31.96166,31.96166,0,0,1,0,384V256A31.96166,31.96166,0,0,1,32,224Zm512-48V448a64.06328,64.06328,0,0,1-64,64H160a64.06328,64.06328,0,0,1-64-64V176a79.974,79.974,0,0,1,80-80H288V32a32,32,0,0,1,64,0V96H464A79.974,79.974,0,0,1,544,176ZM264,256a40,40,0,1,0-40,40A39.997,39.997,0,0,0,264,256Zm-8,128H192v32h64Zm96,0H288v32h64ZM456,256a40,40,0,1,0-40,40A39.997,39.997,0,0,0,456,256Zm-8,128H384v32h64ZM640,256V384a31.96166,31.96166,0,0,1-32,32H576V224h32A31.96166,31.96166,0,0,1,640,256Z" />
    </svg>
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
