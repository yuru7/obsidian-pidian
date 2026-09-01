import { Scope, type App } from "obsidian";
import { useLayoutEffect, useRef, type RefObject } from "react";

/** Obsidian's default Mod+Enter (toggle checkbox) is consumed by the app keymap before textarea keydown. */
export function useSendHotkeyScope(
  app: App,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  sendWithCtrlEnter: boolean,
  onSend: () => void,
): void {
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useLayoutEffect(() => {
    if (!sendWithCtrlEnter) {
      return;
    }
    const el = textareaRef.current;
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
    el.addEventListener("focus", push);
    el.addEventListener("blur", pop);
    if (el.isActiveElement()) {
      push();
    }
    return () => {
      el.removeEventListener("focus", push);
      el.removeEventListener("blur", pop);
      pop();
    };
  }, [app, sendWithCtrlEnter, textareaRef]);
}
