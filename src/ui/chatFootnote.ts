/**
 * MarkdownRenderer emits footnote-link / footnote-backref hash anchors, but a
 * custom ItemView does not run Reading View's jump/hover. Resolve targets inside
 * the rendered message so ids cannot collide across chats. Class names and
 * `fn-` / `fnref-` ids follow current renderer output and may change.
 */
export const FOOTNOTE_FLASH_CLASS = "pidian-footnote-flash";
export const FOOTNOTE_FLASH_MS = 3000;
export const FOOTNOTE_BALLOON_CLASS = "pidian-footnote-balloon";
export const FOOTNOTES_WRAP_CLASS = "pidian-footnotes";
export const FOOTNOTES_COLLAPSED_CLASS = "is-collapsed";
const FOOTNOTE_BALLOON_HIDE_MS = 150;
const FOOTNOTE_BALLOON_GAP_PX = 8;
const FOOTNOTE_CHEVRON_COLLAPSED = "▸";
const FOOTNOTE_CHEVRON_EXPANDED = "▾";

const flashTimers = new WeakMap<HTMLElement, number>();
const footnoteToggleListeners = new WeakMap<HTMLElement, (open: boolean) => void>();

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

export function wrapChatFootnotes(
  root: HTMLElement,
  options: {
    label: string;
    open?: boolean;
    onToggle?: (open: boolean) => void;
  },
): void {
  const open = options.open ?? false;
  for (const node of Array.from(root.querySelectorAll(".footnotes"))) {
    const section = asHtmlElement(node);
    if (!section || section.closest(`.${FOOTNOTES_WRAP_CLASS}`)) {
      continue;
    }
    const parent = section.parentElement;
    if (!parent) {
      continue;
    }
    const wrap = createDiv({ cls: FOOTNOTES_WRAP_CLASS });
    const button = createEl("button", {
      cls: "pidian-disclosure",
      attr: { type: "button" },
    });
    button.appendChild(
      createSpan({
        cls: "pidian-footnotes-chevron",
        attr: { "aria-hidden": "true" },
      }),
    );
    button.appendChild(createSpan({ text: options.label }));
    wrap.appendChild(button);
    parent.insertBefore(wrap, section);
    wrap.appendChild(section);
    stripFootnoteSeparator(section);
    applyFootnotesOpen(wrap, open);
    if (options.onToggle) {
      footnoteToggleListeners.set(wrap, options.onToggle);
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = wrap.classList.contains(FOOTNOTES_COLLAPSED_CLASS);
      applyFootnotesOpen(wrap, next);
      footnoteToggleListeners.get(wrap)?.(next);
    });
  }
}

export function expandChatFootnotes(root: HTMLElement): void {
  for (const node of Array.from(root.querySelectorAll(`.${FOOTNOTES_WRAP_CLASS}`))) {
    const wrap = asHtmlElement(node);
    if (!wrap) {
      continue;
    }
    applyFootnotesOpen(wrap, true);
    footnoteToggleListeners.get(wrap)?.(true);
  }
}

export function isChatFootnotesOpen(root: HTMLElement): boolean {
  const wrap = asHtmlElement(root.querySelector(`.${FOOTNOTES_WRAP_CLASS}`));
  if (!wrap) {
    return true;
  }
  return !wrap.classList.contains(FOOTNOTES_COLLAPSED_CLASS);
}

function applyFootnotesOpen(wrap: HTMLElement, open: boolean): void {
  wrap.classList.toggle(FOOTNOTES_COLLAPSED_CLASS, !open);
  const button = asHtmlElement(wrap.querySelector(".pidian-disclosure"));
  if (button) {
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }
  const chevron = asHtmlElement(wrap.querySelector(".pidian-footnotes-chevron"));
  if (chevron) {
    chevron.setText(open ? FOOTNOTE_CHEVRON_EXPANDED : FOOTNOTE_CHEVRON_COLLAPSED);
  }
}

function stripFootnoteSeparator(section: HTMLElement): void {
  for (const child of Array.from(section.children)) {
    if (child.tagName === "HR") {
      child.remove();
    }
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
    if (!isFootnoteBackref(anchor)) {
      expandChatFootnotes(root);
    }
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
