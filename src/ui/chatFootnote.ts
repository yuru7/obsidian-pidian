/**
 * MarkdownRenderer emits footnote-link / footnote-backref hash anchors, but a
 * custom ItemView does not run Reading View's jump/hover. Resolve targets inside
 * the rendered message so ids cannot collide across chats. Class names and
 * `fn-` / `fnref-` ids follow current renderer output and may change.
 */
export const FOOTNOTE_FLASH_CLASS = "pidian-footnote-flash";
export const FOOTNOTE_FLASH_MS = 3000;
export const FOOTNOTE_BALLOON_CLASS = "pidian-footnote-balloon";
const FOOTNOTE_BALLOON_HIDE_MS = 150;
const FOOTNOTE_BALLOON_GAP_PX = 8;

const flashTimers = new WeakMap<HTMLElement, number>();

export function hashIdFromHref(href: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed) {
    return undefined;
  }
  const hashIndex = trimmed.indexOf("#");
  const id = (hashIndex === -1 ? trimmed : trimmed.slice(hashIndex + 1)).trim();
  return id ? id : undefined;
}

export function footnoteHrefKind(id: string): "definition" | "ref" | null {
  if (id.startsWith("fnref-")) {
    return "ref";
  }
  if (id.startsWith("fn-")) {
    return "definition";
  }
  return null;
}

export function isFootnoteNavAnchor(anchor: Element): boolean {
  return (
    anchor.classList.contains("footnote-link") ||
    anchor.classList.contains("footnote-backref") ||
    anchor.hasAttribute("data-footnote-ref") ||
    anchor.hasAttribute("data-footnote-backref")
  );
}

export function isFootnoteBackref(anchor: Element): boolean {
  return anchor.classList.contains("footnote-backref") || anchor.hasAttribute("data-footnote-backref");
}

export function footnoteHref(anchor: Element): string {
  return anchor.getAttribute("href") ?? anchor.getAttribute("data-href") ?? "";
}

export function footnoteAnchorFromTarget(target: EventTarget | null, root: HTMLElement): HTMLAnchorElement | null {
  const element = asElement(target);
  if (!element || !root.contains(element)) {
    return null;
  }
  const anchor = element.closest("a");
  if (!anchor || !root.contains(anchor) || !isFootnoteNavAnchor(anchor)) {
    return null;
  }
  return asAnchor(anchor);
}

export function inTextFootnoteLinkFromTarget(target: EventTarget | null, root: HTMLElement): HTMLAnchorElement | null {
  const element = asElement(target);
  if (!element || !root.contains(element)) {
    return null;
  }
  if (element.closest(".footnotes") || element.closest(`.${FOOTNOTE_BALLOON_CLASS}`)) {
    return null;
  }
  const anchor = element.closest("a");
  if (anchor && root.contains(anchor) && isFootnoteNavAnchor(anchor) && !isFootnoteBackref(anchor)) {
    return asAnchor(anchor);
  }
  const sup = element.closest("sup.footnote-ref");
  if (!sup || !root.contains(sup)) {
    return null;
  }
  for (const node of Array.from(sup.querySelectorAll("a"))) {
    if (isFootnoteNavAnchor(node) && !isFootnoteBackref(node)) {
      return asAnchor(node);
    }
  }
  return asAnchor(sup.querySelector("a"));
}

export function elementByHashId(root: HTMLElement, href: string): HTMLElement | null {
  const id = hashIdFromHref(href);
  if (!id) {
    return null;
  }
  const found = root.querySelector(`#${cssEscape(id)}`);
  return asHtmlElement(found);
}

export function footnoteHighlightTarget(anchor: Element, destination: HTMLElement): HTMLElement {
  if (isFootnoteBackref(anchor)) {
    return asHtmlElement(destination.closest("sup.footnote-ref")) ?? destination;
  }
  return asHtmlElement(destination.closest("section.footnotes li, .footnotes li")) ?? destination;
}

export function fillFootnoteBalloon(balloon: HTMLElement, definition: HTMLElement): void {
  while (balloon.firstChild) {
    balloon.removeChild(balloon.firstChild);
  }
  for (const child of Array.from(definition.childNodes)) {
    balloon.appendChild(child.cloneNode(true));
  }
  for (const node of Array.from(balloon.querySelectorAll("a.footnote-backref, a[data-footnote-backref]"))) {
    node.remove();
  }
  for (const node of Array.from(balloon.querySelectorAll("[id]"))) {
    node.removeAttribute("id");
  }
}

export function flashFootnoteTarget(target: HTMLElement, win: Window, durationMs = FOOTNOTE_FLASH_MS): void {
  const previous = flashTimers.get(target);
  if (previous !== undefined) {
    win.clearTimeout(previous);
  }
  target.classList.add(FOOTNOTE_FLASH_CLASS);
  const timer = win.setTimeout(() => {
    target.classList.remove(FOOTNOTE_FLASH_CLASS);
    flashTimers.delete(target);
  }, durationMs);
  flashTimers.set(target, timer);
}

export function scrollFootnoteTarget(target: HTMLElement): void {
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

export function bindChatFootnotes(
  root: HTMLElement,
  options: {
    createBalloon: () => HTMLElement;
    decorateBalloon: (balloon: HTMLElement) => void;
    onBalloonClick: (event: MouseEvent) => void;
    host?: HTMLElement;
  },
): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) {
    return () => undefined;
  }
  const host = options.host ?? doc.body;
  let balloon: HTMLElement | null = null;
  let currentLink: HTMLAnchorElement | null = null;
  let hideTimer: number | null = null;
  const chat = asHtmlElement(root.closest(".pidian-chat"));

  const cancelHide = () => {
    if (hideTimer !== null) {
      win.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hideBalloon = () => {
    cancelHide();
    currentLink = null;
    if (!balloon) {
      return;
    }
    balloon.remove();
    balloon = null;
  };

  const hideBalloonSoon = () => {
    cancelHide();
    hideTimer = win.setTimeout(() => {
      hideTimer = null;
      hideBalloon();
    }, FOOTNOTE_BALLOON_HIDE_MS);
  };

  const showBalloon = (link: HTMLAnchorElement) => {
    const definition = elementByHashId(root, footnoteHref(link));
    if (!definition) {
      hideBalloon();
      return;
    }
    cancelHide();
    if (currentLink === link && balloon) {
      return;
    }
    currentLink = link;
    if (!balloon) {
      balloon = options.createBalloon();
      balloon.classList.add(FOOTNOTE_BALLOON_CLASS);
      balloon.addEventListener("click", options.onBalloonClick);
      balloon.addEventListener("pointerover", cancelHide);
      balloon.addEventListener("mouseover", cancelHide);
      balloon.addEventListener("pointerout", onBalloonPointerOut);
      balloon.addEventListener("mouseout", onBalloonPointerOut);
      host.appendChild(balloon);
    }
    fillFootnoteBalloon(balloon, footnoteHighlightTarget(link, definition));
    options.decorateBalloon(balloon);
    positionBalloon(balloon, link, win);
  };

  const onBalloonPointerOut = (event: Event) => {
    if (!isMouseHover(event)) {
      return;
    }
    const next = asElement(relatedTargetOf(event));
    if (next && (balloon?.contains(next) || (currentLink && (currentLink === next || currentLink.contains(next))))) {
      return;
    }
    if (next && inTextFootnoteLinkFromTarget(next, root) === currentLink) {
      return;
    }
    hideBalloonSoon();
  };

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    const anchor = footnoteAnchorFromTarget(event.target, root);
    if (!anchor) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const destination = elementByHashId(root, footnoteHref(anchor));
    if (!destination) {
      return;
    }
    hideBalloon();
    const highlight = footnoteHighlightTarget(anchor, destination);
    scrollFootnoteTarget(highlight);
    flashFootnoteTarget(highlight, win);
  };

  const onHoverIn = (event: Event) => {
    if (!isMouseHover(event)) {
      return;
    }
    const link = inTextFootnoteLinkFromTarget(event.target, root);
    if (!link) {
      return;
    }
    showBalloon(link);
  };

  const onHoverOut = (event: Event) => {
    if (!isMouseHover(event)) {
      return;
    }
    const from = inTextFootnoteLinkFromTarget(event.target, root);
    if (!from) {
      return;
    }
    const next = asElement(relatedTargetOf(event));
    if (next && (from === next || from.contains(next) || balloon?.contains(next))) {
      return;
    }
    if (next && inTextFootnoteLinkFromTarget(next, root) === from) {
      return;
    }
    hideBalloonSoon();
  };

  const onViewportChange = () => {
    hideBalloon();
  };

  root.addEventListener("click", onClick);
  // Window capture runs before document listeners. Obsidian hover-preview may
  // stop mouseover on document so this ItemView's root never sees the bubble.
  // Root capture remains as a fallback when the event does not pass through window.
  win.addEventListener("pointerover", onHoverIn, true);
  win.addEventListener("pointerout", onHoverOut, true);
  win.addEventListener("mouseover", onHoverIn, true);
  win.addEventListener("mouseout", onHoverOut, true);
  root.addEventListener("pointerover", onHoverIn, true);
  root.addEventListener("pointerout", onHoverOut, true);
  root.addEventListener("mouseover", onHoverIn, true);
  root.addEventListener("mouseout", onHoverOut, true);
  chat?.addEventListener("scroll", onViewportChange, { passive: true });
  win.addEventListener("resize", onViewportChange);

  return () => {
    root.removeEventListener("click", onClick);
    win.removeEventListener("pointerover", onHoverIn, true);
    win.removeEventListener("pointerout", onHoverOut, true);
    win.removeEventListener("mouseover", onHoverIn, true);
    win.removeEventListener("mouseout", onHoverOut, true);
    root.removeEventListener("pointerover", onHoverIn, true);
    root.removeEventListener("pointerout", onHoverOut, true);
    root.removeEventListener("mouseover", onHoverIn, true);
    root.removeEventListener("mouseout", onHoverOut, true);
    chat?.removeEventListener("scroll", onViewportChange);
    win.removeEventListener("resize", onViewportChange);
    hideBalloon();
  };
}

function isMouseHover(event: Event): boolean {
  if ("pointerType" in event) {
    const type = (event as PointerEvent).pointerType;
    if (type && type !== "mouse") {
      return false;
    }
  }
  return true;
}

function relatedTargetOf(event: Event): EventTarget | null {
  if ("relatedTarget" in event) {
    return (event as MouseEvent).relatedTarget;
  }
  return null;
}

function positionBalloon(balloon: HTMLElement, anchor: HTMLElement, win: Window): void {
  balloon.classList.remove("is-below");
  balloon.classList.add("is-measuring");
  balloon.style.removeProperty("left");
  balloon.style.removeProperty("top");
  const rect = anchor.getBoundingClientRect();
  const width = balloon.offsetWidth;
  const height = balloon.offsetHeight;
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(FOOTNOTE_BALLOON_GAP_PX, Math.min(left, vw - width - FOOTNOTE_BALLOON_GAP_PX));
  let top = rect.top - height - FOOTNOTE_BALLOON_GAP_PX;
  if (top < FOOTNOTE_BALLOON_GAP_PX) {
    top = Math.min(rect.bottom + FOOTNOTE_BALLOON_GAP_PX, vh - height - FOOTNOTE_BALLOON_GAP_PX);
    balloon.classList.add("is-below");
  }
  balloon.setCssStyles({
    left: `${Math.round(left)}px`,
    top: `${Math.round(Math.max(FOOTNOTE_BALLOON_GAP_PX, top))}px`,
  });
  balloon.classList.remove("is-measuring");
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/([^\w-])/g, "\\$1");
}

function asElement(value: EventTarget | Node | null | undefined): Element | null {
  if (!value || typeof value !== "object" || !("nodeType" in value) || value.nodeType !== 1) {
    return null;
  }
  return value as Element;
}

function asHtmlElement(value: EventTarget | Node | null | undefined): HTMLElement | null {
  const element = asElement(value);
  return element ? (element as HTMLElement) : null;
}

function asAnchor(value: EventTarget | Node | null | undefined): HTMLAnchorElement | null {
  const element = asElement(value);
  if (!element || element.tagName !== "A") {
    return null;
  }
  return element as HTMLAnchorElement;
}
