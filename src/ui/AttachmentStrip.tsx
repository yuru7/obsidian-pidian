import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { App } from "obsidian";
import { t } from "../i18n";
import { imageAttachmentDataUrl, type PidianImageAttachment } from "../domain/sessions/PidianSession";
import { hideCopyImageMenu, showCopyImageMenu } from "./copyImageAttachment";

export function AttachmentStrip({
  app,
  attachments,
  onRemove,
}: {
  app: App;
  attachments: readonly PidianImageAttachment[];
  onRemove?: (id: string) => void;
}): JSX.Element | null {
  const [preview, setPreview] = useState<PidianImageAttachment | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview && !attachments.some((item) => item.id === preview.id)) {
      setPreview(null);
    }
  }, [attachments, preview]);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div ref={stripRef} className="pidian-attachment-strip">
        {attachments.map((attachment) => (
          <AttachmentThumb
            key={attachment.id}
            attachment={attachment}
            onOpen={() => setPreview(attachment)}
            onRemove={onRemove}
          />
        ))}
      </div>
      {preview ? (
        <ImageLightbox
          doc={stripRef.current?.ownerDocument ?? app.workspace.containerEl.ownerDocument}
          attachment={preview}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

function AttachmentThumb({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: PidianImageAttachment;
  onOpen: () => void;
  onRemove?: (id: string) => void;
}): JSX.Element {
  const src = imageAttachmentDataUrl(attachment);
  const removable = Boolean(onRemove);

  return (
    <div
      className={removable ? "pidian-attachment-thumb is-removable" : "pidian-attachment-thumb"}
      onContextMenu={(event) => showCopyImageMenu(event.nativeEvent, attachment)}
    >
      <button
        type="button"
        className="pidian-attachment-thumb-open"
        aria-label={t("uiImageAttachment")}
        onClick={onOpen}
      >
        <img src={src} alt="" />
      </button>
      {onRemove ? (
        <button
          type="button"
          className="pidian-attachment-remove"
          aria-label={t("uiRemoveAttachment")}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove(attachment.id);
          }}
        >
          <CircleXIcon />
        </button>
      ) : null}
    </div>
  );
}

function ImageLightbox({
  doc,
  attachment,
  onClose,
}: {
  doc: Document;
  attachment: PidianImageAttachment;
  onClose: () => void;
}): JSX.Element {
  // Render on document.body so position:fixed covers the Obsidian window.
  // The sidebar pane can create a containing block that would otherwise clip
  // the overlay to the Pidian view.
  const win = doc.defaultView ?? window;

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    win.addEventListener("keydown", onKeyDown, true);
    return () => {
      win.removeEventListener("keydown", onKeyDown, true);
      hideCopyImageMenu();
    };
  }, [onClose, win]);

  return createPortal(
    <div
      className="pidian-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("uiImageAttachment")}
      onMouseDown={(event) => {
        event.stopPropagation();
        // stopPropagation also blocks Obsidian Menu's document hide listener.
        hideCopyImageMenu();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <img
        src={imageAttachmentDataUrl(attachment)}
        alt=""
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => showCopyImageMenu(event.nativeEvent, attachment)}
      />
    </div>,
    doc.body,
  );
}

function CircleXIcon(): JSX.Element {
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
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
