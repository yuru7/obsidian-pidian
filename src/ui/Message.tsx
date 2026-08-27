import { t } from "../i18n";
import type { PidianMessage } from "../domain/sessions/PidianSession";
import { Thinking } from "./Thinking";
import { ToolCall } from "./ToolCall";

export function Message({ message }: { message: PidianMessage }): JSX.Element {
  const name = message.role === "user" ? t("uiYou") : "Pidian";
  return (
    <article className={`pidian-message pidian-message-${message.role}`}>
      <div className="pidian-message-role">{name}</div>
      {message.thinking ? <Thinking text={message.thinking} /> : null}
      {message.toolCalls?.map((toolCall) => (
        <ToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
      {message.text ? <div className="pidian-message-text">{message.text}</div> : null}
    </article>
  );
}
