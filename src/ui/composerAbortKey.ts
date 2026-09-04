import { keyIsComposing, type ComposerKeyEvent } from "./composerSendKey";

export function shouldAbortOnEscape(
  event: ComposerKeyEvent,
  streaming: boolean,
  empty: boolean,
): boolean {
  return event.key === "Escape" && !keyIsComposing(event) && streaming && empty;
}
