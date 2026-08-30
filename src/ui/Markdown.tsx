import { useEffect, useRef, type JSX } from "react";
import { Component, MarkdownRenderer, type App } from "obsidian";

export function Markdown({ app, markdown }: { app: App; markdown: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const component = new Component();
    component.load();
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      el.empty();
      void MarkdownRenderer.render(app, markdown, el, "", component);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      component.unload();
    };
  }, [app, markdown]);

  return <div ref={ref} className="pidian-markdown markdown-preview-view markdown-rendered" />;
}
