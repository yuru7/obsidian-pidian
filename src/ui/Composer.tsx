import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";

const MIN_ROWS = 2;
const MAX_ROWS = 4;

function lineHeightPx(styles: CSSStyleDeclaration): number {
  const fontSize = parseFloat(styles.fontSize);
  const value = styles.lineHeight;
  if (value.endsWith("px")) {
    return parseFloat(value);
  }
  const parsed = parseFloat(value);
  if (value === "normal" || !Number.isFinite(parsed)) {
    return fontSize * 1.5;
  }
  return fontSize * parsed;
}

function fitTextarea(el: HTMLTextAreaElement): void {
  const styles = getComputedStyle(el);
  const lineHeight = lineHeightPx(styles);
  const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const borderY = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const minHeight = lineHeight * MIN_ROWS + paddingY + borderY;
  const maxHeight = lineHeight * MAX_ROWS + paddingY + borderY;
  el.style.height = `${minHeight}px`;
  el.style.height = `${Math.min(maxHeight, Math.max(minHeight, el.scrollHeight + borderY))}px`;
}

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

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      fitTextarea(el);
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
        ref={textareaRef}
        className="pidian-input"
        placeholder={t("uiPlaceholder")}
        disabled={disabled}
        value={text}
        rows={MIN_ROWS}
        onFocus={(event) => fitTextarea(event.currentTarget)}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
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
          </button>
        )}
      </div>
    </div>
  );
}
