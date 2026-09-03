import { useEffect, useRef, useState, type JSX, type RefObject } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import { readChatSelectionAnchor, type ChatSelectionAnchor } from "./quoteSelection";

const TOOLBAR_GAP_PX = 8;

export function SelectionQuoteToolbar({
  containerRef,
  onQuote,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onQuote: (text: string) => void;
}): JSX.Element | null {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;
  const [anchor, setAnchor] = useState<ChatSelectionAnchor | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    if (!win) {
      return;
    }

    let pointerDown = false;

    const sync = () => {
      if (pointerDown) {
        setAnchor(null);
        return;
      }
      setAnchor(readChatSelectionAnchor(container));
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) {
        return;
      }
      pointerDown = true;
      setAnchor(null);
    };

    const onPointerUp = () => {
      pointerDown = false;
      sync();
    };

    doc.addEventListener("selectionchange", sync);
    doc.addEventListener("pointerdown", onPointerDown, true);
    win.addEventListener("pointerup", onPointerUp);
    win.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("scroll", sync, { capture: true, passive: true });
    win.addEventListener("resize", sync);
    const observer = new ResizeObserver(sync);
    observer.observe(container);
    sync();

    return () => {
      doc.removeEventListener("selectionchange", sync);
      doc.removeEventListener("pointerdown", onPointerDown, true);
      win.removeEventListener("pointerup", onPointerUp);
      win.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("scroll", sync, { capture: true });
      win.removeEventListener("resize", sync);
      observer.disconnect();
    };
  }, [containerRef]);

  if (!anchor) {
    return null;
  }

  const container = containerRef.current;
  if (!container) {
    return null;
  }

  const viewWidth = container.ownerDocument.defaultView?.innerWidth ?? anchor.x;
  const x = Math.min(Math.max(anchor.x, 48), Math.max(48, viewWidth - 48));
  const y = anchor.y + (anchor.placeBelow ? TOOLBAR_GAP_PX : -TOOLBAR_GAP_PX);

  return createPortal(
    // Chat overflow would clip an in-flow toolbar, so this is rendered on body.
    <div
      ref={toolbarRef}
      className={`pidian-selection-toolbar${anchor.placeBelow ? " is-below" : ""}`}
      role="toolbar"
      aria-label={t("uiQuote")}
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <button
        type="button"
        className="pidian-selection-quote"
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          onQuoteRef.current(anchor.text);
          containerRef.current?.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
          setAnchor(null);
        }}
      >
        {t("uiQuote")}
      </button>
    </div>,
    container.ownerDocument.body,
  );
}
