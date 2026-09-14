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

export function fitTextarea(el: HTMLTextAreaElement, minRows: number, maxRows: number): void {
  const styles = getComputedStyle(el);
  const lineHeight = lineHeightPx(styles);
  const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const borderY = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const minHeight = lineHeight * minRows + paddingY + borderY;
  const maxHeight = lineHeight * maxRows + paddingY + borderY;
  el.style.height = `${minHeight}px`;
  el.style.height = `${Math.min(maxHeight, Math.max(minHeight, el.scrollHeight + borderY))}px`;
}

export function isTextareaLineBreakInput(event: Event): boolean {
  if (!("inputType" in event)) {
    return false;
  }
  const inputType = event.inputType;
  return inputType === "insertLineBreak" || inputType === "insertParagraph";
}

/**
 * Chromium does not scroll a textarea caret into view on Enter once the field
 * already overflows. Call only after a newline — native caret movement (arrow
 * keys, character input) already scrolls, and a second adjustment jitters.
 */
export function scrollTextareaCaretIntoView(el: HTMLTextAreaElement): void {
  const caret = el.selectionEnd;
  const scrollHeight = el.scrollHeight;
  const clientHeight = el.clientHeight;
  if (
    typeof caret !== "number" ||
    typeof scrollHeight !== "number" ||
    typeof clientHeight !== "number" ||
    !Number.isFinite(scrollHeight) ||
    !Number.isFinite(clientHeight) ||
    clientHeight <= 0 ||
    scrollHeight <= clientHeight
  ) {
    return;
  }

  const caretBottom = caretBottomPx(el, caret);
  if (caretBottom == null) {
    return;
  }
  const viewTop = el.scrollTop || 0;
  const viewBottom = viewTop + clientHeight;
  if (caretBottom > viewBottom) {
    el.scrollTop = caretBottom - clientHeight;
    return;
  }
  const caretTop = caretTopPx(el, caretBottom);
  if (caretTop != null && caretTop < viewTop) {
    el.scrollTop = Math.max(0, caretTop);
  }
}

function caretBottomPx(el: HTMLTextAreaElement, caret: number): number | null {
  if (caret >= el.value.length) {
    return el.scrollHeight;
  }
  try {
    const styles = getComputedStyle(el);
    const lineHeight = lineHeightPx(styles);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      return null;
    }
    const paddingTop = parseFloat(styles.paddingTop);
    const borderTop = parseFloat(styles.borderTopWidth);
    const top =
      (Number.isFinite(borderTop) ? borderTop : 0) + (Number.isFinite(paddingTop) ? paddingTop : 0);
    const lines = Math.max(1, el.value.slice(0, caret).split("\n").length);
    return top + lines * lineHeight;
  } catch {
    return null;
  }
}

function caretTopPx(el: HTMLTextAreaElement, caretBottom: number): number | null {
  try {
    const lineHeight = lineHeightPx(getComputedStyle(el));
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      return null;
    }
    return caretBottom - lineHeight;
  } catch {
    return null;
  }
}
