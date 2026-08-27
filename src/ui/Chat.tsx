import { useEffect, useRef } from "react";
import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Message } from "./Message";

export function Chat({ messages }: { messages: PidianMessage[] }): JSX.Element {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, messages.at(-1)?.text, messages.at(-1)?.thinking]);

  if (messages.length === 0) {
    return <div className="pidian-chat pidian-chat-empty">{t("uiEmptyChat")}</div>;
  }

  return (
    <div className="pidian-chat">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
