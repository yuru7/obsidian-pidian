import { useLayoutEffect, useRef, useState, type JSX } from "react";
import type { App } from "obsidian";
import { t } from "../i18n";
import { shouldSendOnKeyDown } from "./composerSendKey";
import { fitTextarea } from "./fitTextarea";
import { useSendHotkeyScope } from "./useSendHotkeyScope";

const MIN_ROWS = 1;
const MAX_ROWS = 3;

export function UserMessageEditor({
  app,
  initialText,
  sendWithCtrlEnter,
  onSubmit,
  onCancel,
}: {
  app: App;
  initialText: string;
  sendWithCtrlEnter: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const submittedRef = useRef(false);
  textRef.current = text;

  const submit = () => {
    if (submittedRef.current) {
      return;
    }
    const trimmed = textRef.current.trim();
    if (!trimmed) {
      return;
    }
    submittedRef.current = true;
    onSubmit(trimmed);
  };

  useSendHotkeyScope(app, textareaRef, sendWithCtrlEnter, submit);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    fitTextarea(el, MIN_ROWS, MAX_ROWS);
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      fitTextarea(el, MIN_ROWS, MAX_ROWS);
    }
  }, [text]);

  return (
    <div className="pidian-message-edit">
      <textarea
        ref={textareaRef}
        className="pidian-input pidian-message-edit-input"
        aria-label={t("uiEditMessage")}
        value={text}
        rows={MIN_ROWS}
        onFocus={(event) => fitTextarea(event.currentTarget, MIN_ROWS, MAX_ROWS)}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (shouldSendOnKeyDown(event, sendWithCtrlEnter)) {
            event.preventDefault();
            submit();
            return;
          }
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
            onCancel();
          }
        }}
      />
      <button
        type="button"
        className="pidian-button pidian-button-primary pidian-message-edit-send"
        disabled={!text.trim()}
        onClick={submit}
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
    </div>
  );
}
