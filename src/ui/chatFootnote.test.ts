import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import {
  bindChatFootnotes,
  elementByHashId,
  fillFootnoteBalloon,
  flashFootnoteTarget,
  FOOTNOTE_FLASH_CLASS,
  FOOTNOTE_FLASH_MS,
  footnoteAnchorFromTarget,
  footnoteHighlightTarget,
  footnoteHrefKind,
  hashIdFromHref,
  inTextFootnoteLinkFromTarget,
  isFootnoteNavAnchor,
} from "./chatFootnote";

const MARKDOWN_HTML = `
<div class="pidian-markdown">
  <p>
    night
    <sup class="footnote-ref" id="fnref-1-aaa" data-footnote-id="fnref-1-aaa">
      <a href="#fn-1-aaa" class="footnote-link">[1]</a>
    </sup>
    english
    <sup class="footnote-ref" id="fnref-2-bbb" data-footnote-id="fnref-2-bbb">
      <a href="#fn-2-bbb" class="footnote-link">[2]</a>
    </sup>
    again
    <sup class="footnote-ref" id="fnref-1-2-aaa" data-footnote-id="fnref-1-2-aaa">
      <a href="#fn-1-aaa" class="footnote-link">[1]</a>
    </sup>
  </p>
  <section class="footnotes">
    <ol>
      <li id="fn-1-aaa">
        <p>
          <a class="internal-link" href="サンプル.md" data-href="サンプル.md">サンプル.md</a>
          — 帰り道の信号待ちのあたり。
          <a href="#fnref-1-aaa" class="footnote-backref">↵</a>
          <a href="#fnref-1-2-aaa" class="footnote-backref">↵</a>
        </p>
      </li>
      <li id="fn-2-bbb">
        <p>
          <a class="internal-link" href="notes.md" data-href="notes.md">notes.md</a>
          — this is english note
          <a href="#fnref-2-bbb" class="footnote-backref">↵</a>
        </p>
      </li>
    </ol>
  </section>
</div>
`;

describe("hashIdFromHref", () => {
  it("reads the fragment after #", () => {
    expect(hashIdFromHref("#fn-1-aaa")).toBe("fn-1-aaa");
    expect(hashIdFromHref(" #fnref-1-2-aaa ")).toBe("fnref-1-2-aaa");
  });

  it("returns undefined when empty", () => {
    expect(hashIdFromHref("")).toBeUndefined();
    expect(hashIdFromHref("#")).toBeUndefined();
    expect(hashIdFromHref("   ")).toBeUndefined();
  });
});

describe("footnoteHrefKind", () => {
  it("distinguishes definition ids from in-text refs", () => {
    expect(footnoteHrefKind("fn-1-aaa")).toBe("definition");
    expect(footnoteHrefKind("fnref-1-aaa")).toBe("ref");
    expect(footnoteHrefKind("fnref-1-2-aaa")).toBe("ref");
    expect(footnoteHrefKind("heading")).toBeNull();
  });
});

describe("footnote lookup", () => {
  it("finds definition and ref targets inside the markdown root", () => {
    const { root } = renderMarkdown();
    const definition = elementByHashId(root, "#fn-1-aaa");
    const firstRef = elementByHashId(root, "#fnref-1-aaa");
    const secondRef = elementByHashId(root, "#fnref-1-2-aaa");
    expect(definition?.tagName).toBe("LI");
    expect(firstRef?.id).toBe("fnref-1-aaa");
    expect(secondRef?.id).toBe("fnref-1-2-aaa");
  });

  it("does not treat a heading hash as a footnote link", () => {
    const { document } = parseHTML(`<a href="#heading">x</a>`);
    const anchor = document.querySelector("a");
    expect(anchor).toBeTruthy();
    expect(isFootnoteNavAnchor(anchor!)).toBe(false);
  });

  it("resolves an in-text [1] click to the footnote row", () => {
    const { root } = renderMarkdown();
    const link = root.querySelector('a.footnote-link[href="#fn-1-aaa"]');
    const definition = elementByHashId(root, "#fn-1-aaa")!;
    expect(footnoteHighlightTarget(link!, definition).id).toBe("fn-1-aaa");
  });

  it("resolves each ↵ backref to the matching in-text number", () => {
    const { root } = renderMarkdown();
    const backrefs = root.querySelectorAll("a.footnote-backref");
    const first = elementByHashId(root, backrefs[0]!.getAttribute("href") ?? "")!;
    const second = elementByHashId(root, backrefs[1]!.getAttribute("href") ?? "")!;
    expect(footnoteHighlightTarget(backrefs[0]!, first).id).toBe("fnref-1-aaa");
    expect(footnoteHighlightTarget(backrefs[1]!, second).id).toBe("fnref-1-2-aaa");
  });

  it("reads the footnote-link from a hover on the wrapping sup", () => {
    const { root } = renderMarkdown();
    const sup = root.querySelector("#fnref-2-bbb");
    const link = inTextFootnoteLinkFromTarget(sup, root);
    expect(link?.getAttribute("href")).toBe("#fn-2-bbb");
  });

  it("treats data-footnote-ref anchors as in-text sources even without footnote-link", () => {
    const { document } = parseHTML(`
      <div class="pidian-markdown">
        <p>
          <sup class="footnote-ref" id="fnref-1-aaa">
            <a href="#fn-1-aaa" data-footnote-ref="true">[1]</a>
          </sup>
        </p>
        <section class="footnotes"><ol><li id="fn-1-aaa">note</li></ol></section>
      </div>
    `);
    const root = document.querySelector(".pidian-markdown") as HTMLElement;
    const sup = root.querySelector("sup.footnote-ref");
    expect(inTextFootnoteLinkFromTarget(sup, root)?.getAttribute("href")).toBe("#fn-1-aaa");
    expect(isFootnoteNavAnchor(root.querySelector("a")!)).toBe(true);
  });

  it("does not treat a backref as an in-text hover source", () => {
    const { root } = renderMarkdown();
    const backref = root.querySelector("a.footnote-backref");
    expect(inTextFootnoteLinkFromTarget(backref, root)).toBeNull();
    expect(footnoteAnchorFromTarget(backref, root)?.classList.contains("footnote-backref")).toBe(true);
  });
});

describe("fillFootnoteBalloon", () => {
  it("copies the footnote row without backrefs and strips cloned ids", () => {
    const { root, document } = renderMarkdown();
    const balloon = document.createElement("div");
    fillFootnoteBalloon(balloon, elementByHashId(root, "#fn-1-aaa")!);
    expect(balloon.querySelector("a.internal-link")?.getAttribute("data-href")).toBe("サンプル.md");
    expect(balloon.textContent).toContain("帰り道の信号待ちのあたり");
    expect(balloon.querySelector("a.footnote-backref")).toBeNull();
    expect(balloon.querySelector("[id]")).toBeNull();
  });
});

describe("flashFootnoteTarget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds the flash class and removes it after 3 seconds", () => {
    vi.useFakeTimers();
    const { root } = renderMarkdown();
    const row = elementByHashId(root, "#fn-1-aaa")!;
    flashFootnoteTarget(row, globalThis as unknown as Window, FOOTNOTE_FLASH_MS);
    expect(row.classList.contains(FOOTNOTE_FLASH_CLASS)).toBe(true);
    vi.advanceTimersByTime(FOOTNOTE_FLASH_MS - 1);
    expect(row.classList.contains(FOOTNOTE_FLASH_CLASS)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(row.classList.contains(FOOTNOTE_FLASH_CLASS)).toBe(false);
  });
});

describe("bindChatFootnotes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scrolls to and flashes the footnote row when [1] is clicked", () => {
    const { root, document } = renderMarkdown();
    const row = elementByHashId(root, "#fn-1-aaa")!;
    const scrolled: HTMLElement[] = [];
    row.scrollIntoView = () => {
      scrolled.push(row);
    };
    const unbind = bindChatFootnotes(root, {
      createBalloon: () => createTestBalloon(document),
      decorateBalloon: () => undefined,
      onBalloonClick: () => undefined,
      host: document.body,
    });
    const link = root.querySelector("#fnref-1-aaa a.footnote-link")!;
    link.dispatchEvent(clickEvent(document));
    expect(scrolled).toEqual([row]);
    expect(row.classList.contains(FOOTNOTE_FLASH_CLASS)).toBe(true);
    unbind();
  });

  it("scrolls to and flashes the matching in-text number when ↵ is clicked", () => {
    const { root, document } = renderMarkdown();
    const secondRef = elementByHashId(root, "#fnref-1-2-aaa")!;
    const scrolled: HTMLElement[] = [];
    secondRef.scrollIntoView = () => {
      scrolled.push(secondRef);
    };
    const unbind = bindChatFootnotes(root, {
      createBalloon: () => createTestBalloon(document),
      decorateBalloon: () => undefined,
      onBalloonClick: () => undefined,
      host: document.body,
    });
    const backrefs = root.querySelectorAll("a.footnote-backref");
    backrefs[1]!.dispatchEvent(clickEvent(document));
    expect(scrolled).toEqual([secondRef]);
    expect(secondRef.classList.contains(FOOTNOTE_FLASH_CLASS)).toBe(true);
    unbind();
  });

  it("shows a balloon with the clickable footnote body on hover", () => {
    const { root, document } = renderMarkdown();
    stubBox(root.querySelector("#fnref-1-aaa a.footnote-link") as HTMLElement);
    const decorated: HTMLElement[] = [];
    const unbind = bindChatFootnotes(root, {
      createBalloon: () => createTestBalloon(document),
      decorateBalloon: (balloon) => {
        decorated.push(balloon);
      },
      onBalloonClick: () => undefined,
      host: document.body,
    });
    const link = root.querySelector("#fnref-1-aaa a.footnote-link")!;
    link.dispatchEvent(pointerEvent(document, "pointerover"));
    const balloon = document.body.querySelector(".pidian-footnote-balloon");
    expect(balloon).toBeTruthy();
    expect(balloon?.textContent).toContain("帰り道の信号待ちのあたり");
    expect(balloon?.querySelector("a.internal-link")).toBeTruthy();
    expect(balloon?.querySelector("a.footnote-backref")).toBeNull();
    expect(decorated).toHaveLength(1);
    unbind();
  });

  it("shows the balloon on mouseover as well as pointerover", () => {
    const { root, document } = renderMarkdown();
    stubBox(root.querySelector("#fnref-1-aaa a.footnote-link") as HTMLElement);
    const unbind = bindChatFootnotes(root, {
      createBalloon: () => createTestBalloon(document),
      decorateBalloon: () => undefined,
      onBalloonClick: () => undefined,
      host: document.body,
    });
    const link = root.querySelector("#fnref-1-aaa a.footnote-link")!;
    link.dispatchEvent(mouseEvent(document, "mouseover"));
    expect(document.body.querySelector(".pidian-footnote-balloon")).toBeTruthy();
    unbind();
  });
});

function renderMarkdown(): { root: HTMLElement; document: Document } {
  const { document } = parseHTML(`<body>${MARKDOWN_HTML}</body>`);
  const root = document.querySelector(".pidian-markdown") as HTMLElement;
  return { root, document };
}

function createTestBalloon(document: Document): HTMLElement {
  const el = document.createElement("div") as HTMLElement;
  el.setCssStyles = (styles) => {
    Object.assign(el.style, styles);
  };
  return el;
}

function clickEvent(document: Document): Event {
  const event = document.createEvent("MouseEvent");
  event.initEvent("click", true, true);
  Object.defineProperty(event, "button", { value: 0 });
  return event;
}

function pointerEvent(document: Document, type: string): Event {
  const event = document.createEvent("Event");
  event.initEvent(type, true, true);
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

function mouseEvent(document: Document, type: string): Event {
  const event = document.createEvent("MouseEvent");
  event.initEvent(type, true, true);
  return event;
}

function stubBox(el: HTMLElement): void {
  el.getBoundingClientRect = () =>
    ({
      left: 40,
      right: 60,
      top: 80,
      bottom: 96,
      width: 20,
      height: 16,
      x: 40,
      y: 80,
      toJSON: () => ({}),
    }) as DOMRect;
}
