import { useEffect, useRef, type JSX } from "react";
import { Component, MarkdownRenderer, Notice, setIcon, setTooltip, type App } from "obsidian";
import { t } from "../i18n";
import { ObsidianWorkspaceNavigator } from "../infrastructure/obsidian/ObsidianWorkspaceNavigator";
import { bindChatFootnotes, wrapChatFootnotes } from "./chatFootnote";
import {
  internalLinktextFromAttributes,
  linkpathFromLinktext,
  noteFilenameFromLinkpath,
  openChatNoteLink,
} from "./chatNoteLink";
import { ensureTableBlankLines } from "./ensureTableBlankLines";

export function Markdown({ app, markdown }: { app: App; markdown: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const footnotesOpenRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const component = new Component();
    component.load();
    const workspace = new ObsidianWorkspaceNavigator(app);
    const openInternalLink = (event: MouseEvent) => {
      handleInternalLinkClick(event, app, workspace);
    };
    // MarkdownRenderer does not bind clicks in a custom ItemView. Delegate on the
    // container so links and footnote jumps still work after each stream re-render.
    el.addEventListener("click", openInternalLink);
    const unbindFootnotes = bindChatFootnotes(el, {
      createBalloon: () => createDiv({ cls: "pidian-footnote-balloon pidian-markdown" }),
      decorateBalloon: decorateInternalNoteLinks,
      onBalloonClick: openInternalLink,
    });
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      el.empty();
      void MarkdownRenderer.render(app, ensureTableBlankLines(markdown), el, "", component).then(() => {
        if (cancelled) {
          return;
        }
        decorateInternalNoteLinks(el);
        wrapChatFootnotes(el, {
          label: t("uiFootnote"),
          open: footnotesOpenRef.current,
          onToggle: (open) => {
            footnotesOpenRef.current = open;
          },
        });
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      el.removeEventListener("click", openInternalLink);
      unbindFootnotes();
      component.unload();
    };
  }, [app, markdown]);

  return <div ref={ref} className="pidian-markdown markdown-preview-view markdown-rendered" />;
}

function decorateInternalNoteLinks(root: HTMLElement): void {
  for (const node of root.querySelectorAll("a.internal-link")) {
    if (!node.instanceOf(HTMLElement)) {
      continue;
    }
    const linktext = internalLinktextFromAttributes(
      node.getAttribute("data-href"),
      node.getAttribute("href"),
    );
    const path = linktext ? linkpathFromLinktext(linktext) : "";
    const filename = noteFilenameFromLinkpath(path) || node.getText().trim();
    node.empty();
    const icon = node.createSpan({
      cls: "pidian-note-link-icon",
      attr: { "aria-hidden": "true" },
    });
    setIcon(icon, "sticky-note");
    if (filename) {
      node.appendText(filename);
    }
    // Native `title` would show an OS tooltip; Obsidian setTooltip uses aria-label instead.
    node.removeAttribute("title");
    if (path) {
      setTooltip(node, path, { placement: "top" });
    }
  }
  for (const node of root.querySelectorAll("a.footnote-link, a.footnote-backref")) {
    node.removeAttribute("title");
  }
}

function handleInternalLinkClick(event: MouseEvent, app: App, workspace: ObsidianWorkspaceNavigator): void {
  if (event.button !== 0) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const anchor = target.closest("a.internal-link");
  if (!anchor) {
    return;
  }
  const linktext = internalLinktextFromAttributes(
    anchor.getAttribute("data-href"),
    anchor.getAttribute("href"),
  );
  if (!linktext) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void openChatNoteLink(linktext, {
    resolve: (linkpath) => app.metadataCache.getFirstLinkpathDest(linkpath, "")?.path,
    openFile: async (path) => {
      await workspace.openFile(path);
    },
  }).catch((error: unknown) => {
    new Notice(t("noticeError", { error: error instanceof Error ? error.message : String(error) }));
  });
}
