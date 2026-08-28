import { useEffect, useRef } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Message } from "./Message";

export function Chat({
  app,
  messages,
}: {
  app: App;
  messages: PidianMessage[];
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const last = messages.at(-1);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text, last?.thinking]);

  if (messages.length === 0) {
    return <div ref={rootRef} className="pidian-chat pidian-chat-empty">{t("uiEmptyChat")}</div>;
  }

  return (
    <div ref={rootRef} className="pidian-chat">
      {messages.map((message) => (
        <Message key={message.id} app={app} message={message} />
      ))}
    </div>
  );
}
