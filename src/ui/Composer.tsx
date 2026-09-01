import { Scope } from "obsidian";
import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { shouldSendOnKeyDown } from "./composerSendKey";

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
  const textRef = useRef(text);
  const sendRef = useRef<() => void>(() => undefined);
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
  sendRef.current = send;

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

  // Obsidian's default Mod+Enter (toggle checkbox) is consumed by the app keymap
  // before the textarea keydown. Push a child scope while the composer is focused.
  useLayoutEffect(() => {
    if (!sendWithCtrlEnter) {
      return;
    }
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    const keymap = plugin.app.keymap;
    const scope = new Scope(plugin.app.scope);
    scope.register(["Mod"], "Enter", (event) => {
      if (event.isComposing) {
        return;
      }
      sendRef.current();
      return false;
    });
    let pushed = false;
    const push = (): void => {
      if (!pushed) {
        keymap.pushScope(scope);
        pushed = true;
      }
    };
    const pop = (): void => {
      if (pushed) {
        keymap.popScope(scope);
        pushed = false;
      }
    };
    el.addEventListener("focus", push);
    el.addEventListener("blur", pop);
    if (el.isActiveElement()) {
      push();
    }
    return () => {
      el.removeEventListener("focus", push);
      el.removeEventListener("blur", pop);
      pop();
    };
  }, [plugin, sendWithCtrlEnter]);

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
