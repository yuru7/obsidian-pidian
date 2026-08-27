import { useState } from "react";
import { t } from "../i18n";

export function Composer({
  disabled,
  streaming,
  toolbar,
  onSend,
  onAbort,
}: {
  disabled: boolean;
  streaming: boolean;
  toolbar?: JSX.Element;
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
        placeholder={t("uiPlaceholder")}
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
        {toolbar}
        {streaming ? (
          <button className="pidian-button" onClick={onAbort}>
            {t("uiStop")}
          </button>
        ) : (
          <button
            className="pidian-button pidian-button-primary pidian-send-button"
            disabled={disabled}
            onClick={send}
            aria-label={t("uiSend")}
            title={t("uiSend")}
          >
            <svg
              className="pidian-send-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="21.368 12.001 3 21.609 3 14 11 12 3 9.794 3 2.394" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
