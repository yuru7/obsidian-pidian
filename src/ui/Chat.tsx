import { Fragment, useEffect, useRef, type JSX } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Message } from "./Message";

export function Chat({
  app,
  messages,
  forkedMessageCount,
  onFork,
  forkDisabled,
}: {
  app: App;
  messages: PidianMessage[];
  forkedMessageCount?: number;
  onFork?: (messageId: string) => void;
  forkDisabled?: boolean;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const last = messages.at(-1);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text, last?.thinking, forkedMessageCount]);

  if (messages.length === 0) {
    return <div ref={rootRef} className="pidian-chat pidian-chat-empty">{t("uiEmptyChat")}</div>;
  }

  return (
    <div ref={rootRef} className="pidian-chat">
      {messages.map((message, index) => (
        <Fragment key={message.id}>
          <Message
            app={app}
            message={message}
            onFork={onFork}
            forkDisabled={forkDisabled}
          />
          {forkedMessageCount === index + 1 ? (
            <p className="pidian-fork-notice">{t("uiForked")}</p>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
