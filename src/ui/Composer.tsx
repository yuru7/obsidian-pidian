import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { shouldSendOnKeyDown } from "./composerSendKey";
import { fitTextarea } from "./fitTextarea";
import { useSendHotkeyScope } from "./useSendHotkeyScope";

const MIN_ROWS = 2;
const MAX_ROWS = 4;

export function Composer({
  plugin,
  disabled,
  streaming,
  toolbar,
  onSend,
  onAbort,
}: {
  plugin: PidianPlugin;
  disabled: boolean;
  streaming: boolean;
  toolbar?: JSX.Element;
  onSend: (text: string) => void;
  onAbort: () => void;
}): JSX.Element {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const sendWithCtrlEnter = plugin.settings.sendWithCtrlEnter;
  textRef.current = text;

  const send = () => {
    const trimmed = textRef.current.trim();
    if (!trimmed || disabled || streaming) {
      return;
    }
    textRef.current = "";
    setText("");
    onSend(trimmed);
  };

  useSendHotkeyScope(plugin.app, textareaRef, sendWithCtrlEnter, send);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      fitTextarea(el, MIN_ROWS, MAX_ROWS);
    }
  }, [text]);

  useLayoutEffect(() => {
    const tryFocus = (): boolean => {
      const el = textareaRef.current;
      if (!el || el.disabled) {
        return false;
      }
      el.focus();
      return true;
    };
    return plugin.subscribeComposerFocus(tryFocus);
  }, [plugin, disabled]);

  return (
    <div className="pidian-composer">
      <textarea
        ref={textareaRef}
        className="pidian-input"
        placeholder={t("uiPlaceholder")}
        disabled={disabled}
        value={text}
        rows={MIN_ROWS}
        onFocus={(event) => fitTextarea(event.currentTarget, MIN_ROWS, MAX_ROWS)}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (shouldSendOnKeyDown(event, sendWithCtrlEnter)) {
            event.preventDefault();
            send();
            return;
          }
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (streaming) {
              onAbort();
            }
          }
        }}
      />
      <div className="pidian-composer-actions">
        {toolbar}
        {streaming ? (
          <button
            className="pidian-button pidian-button-primary pidian-send-button"
            onClick={onAbort}
            aria-label={t("uiStop")}
            title={t("uiStop")}
          >
            <svg
              className="pidian-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            className="pidian-button pidian-button-primary pidian-send-button"
            disabled={disabled}
            onClick={send}
            aria-label={t("uiSend")}
            title={t("uiSend")}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function SendIcon(): JSX.Element {
  return (
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
      <polygon points="21.368 12.001 3 21.609 3 14 11 12 3 9.794 3 2.394" />
    </svg>
  );
}
