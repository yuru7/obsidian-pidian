import { useEffect, useRef, type JSX } from "react";
import { Component, MarkdownRenderer, Notice, setIcon, type App } from "obsidian";
import { t } from "../i18n";
import { ObsidianWorkspaceNavigator } from "../infrastructure/obsidian/ObsidianWorkspaceNavigator";
import { internalLinktextFromAttributes, openChatNoteLink } from "./chatNoteLink";

export function Markdown({ app, markdown }: { app: App; markdown: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const component = new Component();
    component.load();
    const workspace = new ObsidianWorkspaceNavigator(app);
    // MarkdownRenderer does not bind clicks in a custom ItemView. Delegate on the
    // container so links still work after each stream re-render.
    const onClick = (event: MouseEvent) => {
      handleInternalLinkClick(event, app, workspace);
    };
    el.addEventListener("click", onClick);
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      el.empty();
      void MarkdownRenderer.render(app, markdown, el, "", component).then(() => {
        if (cancelled) {
          return;
        }
        decorateInternalNoteLinks(el);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      el.removeEventListener("click", onClick);
      component.unload();
    };
  }, [app, markdown]);

  return <div ref={ref} className="pidian-markdown markdown-preview-view markdown-rendered" />;
}

function decorateInternalNoteLinks(root: HTMLElement): void {
  for (const node of root.querySelectorAll("a.internal-link")) {
    if (!(node instanceof HTMLElement) || node.querySelector(":scope > .pidian-note-link-icon")) {
      continue;
    }
    const icon = document.createElement("span");
    icon.className = "pidian-note-link-icon";
    icon.setAttribute("aria-hidden", "true");
    setIcon(icon, "sticky-note");
    node.prepend(icon);
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
