import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { setTooltip, type Scope } from "obsidian";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { shouldAbortOnEscape } from "./composerAbortKey";
import { shouldSendOnKeyDown } from "./composerSendKey";
import { fitTextarea } from "./fitTextarea";
import { useAbortHotkeyScope } from "./useAbortHotkeyScope";
import { useSendHotkeyScope } from "./useSendHotkeyScope";

const MIN_ROWS = 2;
const MAX_ROWS = 4;

export function Composer({
  plugin,
  keymapScope,
  disabled,
  streaming,
  toolbar,
  onSend,
  onAbort,
}: {
  plugin: PidianPlugin;
  keymapScope: Scope | null;
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
  useAbortHotkeyScope(keymapScope, streaming, () => textRef.current.length === 0, onAbort);

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
      return document.activeElement === el;
    };
    return plugin.subscribeComposerFocus(tryFocus);
  }, [plugin, disabled]);

  return (
    <div className="pidian-composer">
      <textarea
        ref={textareaRef}
        className="pidian-input"
        placeholder={streaming ? t("uiPlaceholderStop") : t("uiPlaceholder")}
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
          if (shouldAbortOnEscape(event, streaming, textRef.current.length === 0)) {
            event.preventDefault();
            event.stopPropagation();
            onAbort();
          }
        }}
      />
      <div className="pidian-composer-actions">
        {toolbar}
        {streaming ? (
          <SendActionButton label={t("uiStop")} onClick={onAbort}>
            <StopIcon />
          </SendActionButton>
        ) : (
          <SendActionButton label={t("uiSend")} disabled={disabled} onClick={send}>
            <SendIcon />
          </SendActionButton>
        )}
      </div>
    </div>
  );
}

function SendActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      setTooltip(el, label, { placement: "top" });
    }
  }, [label]);

  return (
    <button
      ref={ref}
      className="pidian-button pidian-button-primary pidian-send-button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg
      className="pidian-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
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
