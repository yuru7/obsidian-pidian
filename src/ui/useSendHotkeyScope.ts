import { Scope, type App } from "obsidian";
import { useLayoutEffect, useRef, type RefObject } from "react";

/** Obsidian's default Mod+Enter (toggle checkbox) is consumed by the app keymap before editor keydown. */
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
    const keymap = app.keymap;
    const scope = new Scope(app.scope);
    scope.register(["Mod"], "Enter", (event) => {
      if (event.isComposing) {
        return;
      }
      onSendRef.current();
      return false;
    });
    let pushed = false;
    const push = (): void => {
      if (!pushed) {
        keymap.pushScope(scope);
        pushed = true;
      }
    };
    const pop = (): void => {
      if (pushed) {
        keymap.popScope(scope);
        pushed = false;
      }
    };
    const onFocusIn = (): void => {
      push();
    };
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget;
      if (next instanceof Node && el.contains(next)) {
        return;
      }
      pop();
    };
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    const active = el.ownerDocument.activeElement;
    if (active && el.contains(active)) {
      push();
    }
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      pop();
    };
  }, [app, sendWithCtrlEnter, targetRef]);
}
