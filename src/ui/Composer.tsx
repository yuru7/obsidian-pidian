import { useImperativeHandle, useLayoutEffect, useRef, useState, type JSX, type Ref } from "react";
import { setTooltip, type Scope } from "obsidian";
import type { PidianImageAttachment } from "../domain/sessions/PidianSession";
import { createChatInputEditor, type ChatInputEditor } from "../editor/chat-input-editor";
import { t } from "../i18n";
import type PidianPlugin from "../main";
import { AttachmentStrip } from "./AttachmentStrip";
import { clipboardHasPlainText, imageBlobsFromClipboard } from "./clipboardImage";
import { attachmentFromClipboardBlob } from "./clipboardImageConvert";
import { composerInputKeyAction } from "./composerInputKey";
import { composerHasSendableContent, composerVisionBlocksSend } from "./composerSendState";
import { insertQuoteIntoComposer } from "./quoteSelection";
import { useAbortHotkeyScope } from "./useAbortHotkeyScope";
import { useSendHotkeyScope } from "./useSendHotkeyScope";

export type ComposerHandle = {
  insertQuote: (selectedText: string) => void;
};

export function Composer({
  plugin,
  keymapScope,
  disabled,
  streaming,
  supportsImages,
  toolbar,
  onSend,
  onAbort,
  ref,
}: {
  plugin: PidianPlugin;
  keymapScope: Scope | null;
  disabled: boolean;
  streaming: boolean;
  supportsImages: boolean;
  toolbar?: JSX.Element;
  onSend: (text: string, attachments: PidianImageAttachment[]) => void;
  onAbort: () => void;
  ref?: Ref<ComposerHandle>;
}): JSX.Element {
  const [empty, setEmpty] = useState(true);
  const [attachments, setAttachments] = useState<PidianImageAttachment[]>([]);
  const composerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ChatInputEditor | null>(null);
  const draftRef = useRef("");
  const attachmentsRef = useRef(attachments);
  const disabledRef = useRef(disabled);
  const streamingRef = useRef(streaming);
  const supportsImagesRef = useRef(supportsImages);
  const sendWithCtrlEnterRef = useRef(plugin.settings.sendWithCtrlEnter);
  const onSendRef = useRef(onSend);
  const onAbortRef = useRef(onAbort);
  const editMode = plugin.settings.composerEditMode;
  attachmentsRef.current = attachments;
  disabledRef.current = disabled;
  streamingRef.current = streaming;
  supportsImagesRef.current = supportsImages;
  sendWithCtrlEnterRef.current = plugin.settings.sendWithCtrlEnter;
  onSendRef.current = onSend;
  onAbortRef.current = onAbort;

  const send = (): void => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const trimmed = editor.getValue().trim();
    const images = attachmentsRef.current;
    if (disabledRef.current || streamingRef.current) {
      return;
    }
    if (composerVisionBlocksSend(images.length, supportsImagesRef.current)) {
      return;
    }
    if (!composerHasSendableContent(trimmed, images.length)) {
      return;
    }
    editor.clear();
    draftRef.current = "";
    setEmpty(true);
    setAttachments([]);
    onSendRef.current(trimmed, images);
  };

  const sendRef = useRef(send);
  sendRef.current = send;

  useImperativeHandle(ref, () => ({
    insertQuote(selectedText: string) {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      const next = insertQuoteIntoComposer(editor.getValue(), selectedText);
      if (!next) {
        return;
      }
      editor.setValue(next.text);
      editor.focus();
      setEmpty(next.text.length === 0);
    },
  }));

  useSendHotkeyScope(plugin.app, hostRef, plugin.settings.sendWithCtrlEnter, send);
  useAbortHotkeyScope(
    keymapScope,
    streaming,
    () => editorRef.current?.getValue().length === 0 && attachmentsRef.current.length === 0,
    onAbort,
  );

  useLayoutEffect(() => {
    editorRef.current?.setDisabled(disabled);
  }, [disabled]);

  useLayoutEffect(() => {
    const root = composerRef.current;
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

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const editor = createChatInputEditor(plugin.app, host, {
      disabled: disabledRef.current,
      mode: editMode,
      onChange(value) {
        draftRef.current = value;
        setEmpty(value.length === 0);
      },
    });
    if (draftRef.current) {
      editor.setValue(draftRef.current);
    }
    editorRef.current = editor;
    setEmpty(editor.getValue().length === 0);

    const handleInputKeyDown = (event: KeyboardEvent): void => {
      // Synthetic Enter from newline() must reach CodeMirror as a plain Enter.
      if (!event.isTrusted) {
        return;
      }
      const current = editorRef.current;
      if (!current) {
        return;
      }
      const action = composerInputKeyAction(event, {
        sendWithCtrlEnter: sendWithCtrlEnterRef.current,
        streaming: streamingRef.current,
        empty: current.getValue().length === 0 && attachmentsRef.current.length === 0,
      });
      if (action === "abort") {
        event.preventDefault();
        event.stopPropagation();
        onAbortRef.current();
        return;
      }
      if (action === "send") {
        event.preventDefault();
        event.stopPropagation();
        sendRef.current();
        return;
      }
      if (action === "newline") {
        event.preventDefault();
        event.stopPropagation();
        current.newline();
      }
    };
    host.addEventListener("keydown", handleInputKeyDown, true);

    const tryFocus = (): boolean => {
      if (disabledRef.current) {
        return false;
      }
      editor.focus();
      return Boolean(host.contains(host.ownerDocument.activeElement));
    };
    const unsubFocus = plugin.subscribeComposerFocus(tryFocus);

    return () => {
      host.removeEventListener("keydown", handleInputKeyDown, true);
      unsubFocus();
      editor.destroy();
      editorRef.current = null;
    };
  }, [plugin, editMode]);

  const placeholder = streaming ? t("uiPlaceholderStop") : t("uiPlaceholder");
  const visionBlocked = composerVisionBlocksSend(attachments.length, supportsImages);

  return (
    <div ref={composerRef} className="pidian-composer">
      <AttachmentStrip
        app={plugin.app}
        attachments={attachments}
        onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
      />
      <div className={empty ? "pidian-composer-field is-empty" : "pidian-composer-field"}>
        <div
          ref={hostRef}
          className="pidian-composer-input"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              editorRef.current?.focus();
            }
          }}
        />
        {empty ? <div className="pidian-composer-placeholder">{placeholder}</div> : null}
      </div>
      <div className="pidian-composer-actions">
        {toolbar}
        {streaming ? (
          <SendActionButton label={t("uiStop")} onClick={onAbort}>
            <StopIcon />
          </SendActionButton>
        ) : (
          <SendActionButton
            label={visionBlocked ? t("uiVisionRequiredToSend") : t("uiSend")}
            disabled={disabled || visionBlocked}
            onClick={send}
          >
            {visionBlocked ? <WarningIcon /> : <SendIcon />}
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
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      setTooltip(el, label, { placement: "top" });
    }
  }, [label]);

  return (
    <span ref={ref} className="pidian-send-button-wrap">
      <button
        className="pidian-button pidian-button-primary pidian-send-button"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </button>
    </span>
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

function WarningIcon(): JSX.Element {
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
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
