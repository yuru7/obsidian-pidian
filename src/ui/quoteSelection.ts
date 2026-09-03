export type QuoteInsertion = {
  text: string;
  cursor: number;
};

export function formatQuoteMarkdown(selected: string): string {
  const normalized = selected.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }
  return normalized
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

export function insertQuoteIntoComposer(current: string, selected: string): QuoteInsertion | null {
  const quote = formatQuoteMarkdown(selected);
  if (!quote) {
    return null;
  }
  const prefix = current.length === 0 ? "" : padToBlankLine(current);
  const text = `${prefix}${quote}\n\n`;
  return { text, cursor: text.length };
}

function padToBlankLine(text: string): string {
  if (text.endsWith("\n\n")) {
    return text;
  }
  if (text.endsWith("\n")) {
    return `${text}\n`;
  }
  return `${text}\n\n`;
}

export type ChatSelectionAnchor = {
  text: string;
  x: number;
  y: number;
  placeBelow: boolean;
};

export function readChatSelectionAnchor(container: HTMLElement): ChatSelectionAnchor | null {
  const selection = container.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }
  if (selectionInNonQuoteable(selection)) {
    return null;
  }
  const text = selection.toString();
  if (!text.trim()) {
    return null;
  }
  const first = range.getClientRects()[0];
  if (!first || (first.width === 0 && first.height === 0)) {
    return null;
  }
  const containerRect = container.getBoundingClientRect();
  if (!rectsOverlap(first, containerRect)) {
    return null;
  }
  const toolbarEstimatePx = 36;
  const gapPx = 8;
  const placeBelow = first.top - toolbarEstimatePx - gapPx < containerRect.top;
  return {
    text,
    x: first.left + first.width / 2,
    y: placeBelow ? first.bottom : first.top,
    placeBelow,
  };
}

function selectionInNonQuoteable(selection: Selection): boolean {
  for (const node of [selection.anchorNode, selection.focusNode]) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (el?.closest("textarea, input, .pidian-selection-toolbar")) {
      return true;
    }
  }
  return false;
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
