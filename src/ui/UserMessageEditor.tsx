import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { setTooltip, type App } from "obsidian";
import type { PidianImageAttachment } from "../domain/sessions/PidianSession";
import { t } from "../i18n";
import { AttachmentStrip } from "./AttachmentStrip";
import { clipboardHasPlainText, imageBlobsFromClipboard } from "./clipboardImage";
import { attachmentFromClipboardBlob } from "./clipboardImageConvert";
import { shouldSendOnKeyDown } from "./composerSendKey";
import { composerHasSendableContent, composerVisionBlocksSend } from "./composerSendState";
import { fitTextarea, isTextareaLineBreakInput, scrollTextareaCaretIntoView } from "./fitTextarea";
import { useSendHotkeyScope } from "./useSendHotkeyScope";

const MIN_ROWS = 1;
const MAX_ROWS = 3;

export function UserMessageEditor({
  app,
  initialText,
  initialAttachments,
  sendWithCtrlEnter,
  supportsImages,
  toolbar,
  onSubmit,
  onCancel,
}: {
  app: App;
  initialText: string;
  initialAttachments: readonly PidianImageAttachment[];
  sendWithCtrlEnter: boolean;
  supportsImages: boolean;
  toolbar?: JSX.Element;
  onSubmit: (text: string, attachments: PidianImageAttachment[]) => void;
  onCancel: () => void;
}): JSX.Element {
  const [text, setText] = useState(initialText);
  const [attachments, setAttachments] = useState<PidianImageAttachment[]>(() => [...initialAttachments]);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const attachmentsRef = useRef(attachments);
  const submittedRef = useRef(false);
  textRef.current = text;
  attachmentsRef.current = attachments;

  const visionBlocked = composerVisionBlocksSend(attachments.length, supportsImages);

  const submit = () => {
    if (submittedRef.current || visionBlocked) {
      return;
    }
    const trimmed = textRef.current.trim();
    const images = attachmentsRef.current;
    if (!composerHasSendableContent(trimmed, images.length)) {
      return;
    }
    submittedRef.current = true;
    onSubmit(trimmed, images);
  };

  useSendHotkeyScope(app, textareaRef, sendWithCtrlEnter, submit);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    const end = el.value.length;
    el.focus();
    el.setSelectionRange(end, end);
    fitTextarea(el, MIN_ROWS, MAX_ROWS);
  }, []);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      fitTextarea(el, MIN_ROWS, MAX_ROWS);
    }
  }, [text]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const handlePaste = (event: ClipboardEvent): void => {
      const blobs = imageBlobsFromClipboard(event.clipboardData);
      if (blobs.length === 0) {
        return;
      }
      if (!clipboardHasPlainText(event.clipboardData)) {
        event.preventDefault();
        event.stopPropagation();
      }
      void (async () => {
        const next: PidianImageAttachment[] = [];
        for (const blob of blobs) {
          const attachment = await attachmentFromClipboardBlob(blob);
          if (attachment) {
            next.push(attachment);
          }
        }
        if (next.length > 0) {
          setAttachments((current) => [...current, ...next]);
        }
      })();
    };
    root.addEventListener("paste", handlePaste, true);
    return () => {
      root.removeEventListener("paste", handlePaste, true);
    };
  }, []);

  const sendLabel = visionBlocked ? t("uiVisionRequiredToSend") : t("uiSend");

  return (
    <div ref={rootRef} className="pidian-message-edit">
      <AttachmentStrip
        app={app}
        attachments={attachments}
        onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
      />
      <textarea
        ref={textareaRef}
        className="pidian-input pidian-message-edit-input"
        aria-label={t("uiEditMessage")}
        value={text}
        rows={MIN_ROWS}
        onFocus={(event) => fitTextarea(event.currentTarget, MIN_ROWS, MAX_ROWS)}
        onChange={(event) => {
          const el = event.currentTarget;
          setText(event.target.value);
          if (isTextareaLineBreakInput(event.nativeEvent)) {
            fitTextarea(el, MIN_ROWS, MAX_ROWS);
            scrollTextareaCaretIntoView(el);
          }
        }}
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
      <div className="pidian-message-edit-actions">
        {toolbar}
        <EditSendButton
          label={sendLabel}
          disabled={!composerHasSendableContent(text, attachments.length) || visionBlocked}
          warning={visionBlocked}
          onClick={submit}
        />
      </div>
    </div>
  );
}

function EditSendButton({
  label,
  disabled,
  warning,
  onClick,
}: {
  label: string;
  disabled: boolean;
  warning: boolean;
  onClick: () => void;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      setTooltip(el, label, { placement: "top" });
    }
  }, [label]);

  return (
    <span ref={ref} className="pidian-message-edit-send-wrap">
      <button
        type="button"
        className="pidian-button pidian-button-primary pidian-message-edit-send"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {warning ? (
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
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        ) : (
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
        )}
      </button>
    </span>
  );
}
