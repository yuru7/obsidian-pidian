import { type App } from "obsidian";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { composerOwnsKeyEvent } from "./composerHasFocus";
import { keyIsComposing } from "./composerSendKey";

/**
 * Obsidian consumes Mod+Enter (open link / checkbox) in the app keymap before
 * editor keydown. Live Preview also pushes its own keymap Scope on focus, which
 * used to bury a composer-local Scope. Register on app.scope (always on the
 * parent chain) and intercept at the window in capture so Ctrl+Enter still
 * sends while the composer is focused.
 */
export function useSendHotkeyScope<T extends HTMLElement>(
  app: App,
  targetRef: RefObject<T | null>,
  sendWithCtrlEnter: boolean,
  onSend: () => void,
): void {
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useLayoutEffect(() => {
    if (!sendWithCtrlEnter) {
      return;
    }
    const el = targetRef.current;
    if (!el) {
      return;
    }
    const trySend = (event: KeyboardEvent): false | undefined => {
      if (
        keyIsComposing(event) ||
        !composerOwnsKeyEvent(el, event, el.ownerDocument.activeElement)
      ) {
        return;
      }
      onSendRef.current();
      return false;
    };
    const appHandler = app.scope.register(["Mod"], "Enter", trySend);
    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      if (trySend(event) === false) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Capture on the owner window so pop-out leaves still intercept before
    // document-level keymap. Composer.send is a no-op after the first clear.
    const win = el.ownerDocument.defaultView;
    win?.addEventListener("keydown", onWindowKeyDown, true);
    return () => {
      win?.removeEventListener("keydown", onWindowKeyDown, true);
      app.scope.unregister(appHandler);
    };
  }, [app, sendWithCtrlEnter, targetRef]);
}
