import { useState } from "react";

export function Composer({
  disabled,
  streaming,
  onSend,
  onAbort,
}: {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}): JSX.Element {
  const [text, setText] = useState("");

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || streaming) {
      return;
    }
    setText("");
    onSend(trimmed);
  };

  return (
    <div className="pidian-composer">
      <textarea
        className="pidian-input"
        placeholder="Ask Pidian..."
        disabled={disabled}
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className="pidian-composer-actions">
        {streaming ? (
          <button className="pidian-button" onClick={onAbort}>
            Stop
          </button>
        ) : (
          <button className="pidian-button pidian-button-primary" disabled={disabled} onClick={send}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
