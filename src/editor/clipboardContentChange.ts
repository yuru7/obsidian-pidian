/**
 * CodeMirror intercepts paste, cut, and Backspace/Delete, then writes the
 * document itself. A parent `input` listener often never runs. Defer clipboard
 * reads to the next task so the editor has applied the change; keyup can emit
 * immediately because the keymap already ran on keydown. Navigation keys are
 * ignored so native caret scrolling is not double-adjusted.
 */
export function listenClipboardContentChange(el: HTMLElement, onChange: () => void): () => void {
  const timerWindow = (): Window => el.ownerDocument?.defaultView ?? window;
  let timer = 0;
  const schedule = (): void => {
    const win = timerWindow();
    win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      timer = 0;
      onChange();
    }, 0);
  };
  const onKeyUp = (event: Event): void => {
    const key = "key" in event && typeof event.key === "string" ? event.key : "";
    if (key !== "Backspace" && key !== "Delete") {
      return;
    }
    onChange();
  };
  el.addEventListener("paste", schedule, true);
  el.addEventListener("cut", schedule, true);
  el.addEventListener("keyup", onKeyUp, true);
  return () => {
    timerWindow().clearTimeout(timer);
    el.removeEventListener("paste", schedule, true);
    el.removeEventListener("cut", schedule, true);
    el.removeEventListener("keyup", onKeyUp, true);
  };
}
