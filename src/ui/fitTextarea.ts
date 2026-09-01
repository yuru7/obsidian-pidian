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
