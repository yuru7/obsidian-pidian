import { shouldAbortOnEscape } from "./composerAbortKey";
import { keyIsComposing, shouldSendOnKeyDown, type ComposerKeyEvent } from "./composerSendKey";

export type ComposerInputKeyAction = "send" | "abort" | "newline" | null;

export function composerInputKeyAction(
  event: ComposerKeyEvent,
  options: {
    sendWithCtrlEnter: boolean;
    streaming: boolean;
    empty: boolean;
  },
): ComposerInputKeyAction {
  if (event.key === "Escape") {
    return shouldAbortOnEscape(event, options.streaming, options.empty) ? "abort" : null;
  }
  if (shouldSendOnKeyDown(event, options.sendWithCtrlEnter)) {
    return "send";
  }
  if (shouldNewlineAsEditorEnter(event, options.sendWithCtrlEnter)) {
    return "newline";
  }
  return null;
}

/** Enter-to-send: Shift+Enter should run Live Preview Enter (list continue), not Shift+Enter (soft break). */
export function shouldNewlineAsEditorEnter(event: ComposerKeyEvent, sendWithCtrlEnter: boolean): boolean {
  return event.key === "Enter" && !sendWithCtrlEnter && Boolean(event.shiftKey) && !keyIsComposing(event);
}
