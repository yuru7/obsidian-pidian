/**
 * CodeMirror intercepts paste, cut, and Backspace/Delete, then writes the
 * document itself. A parent `input` listener often never runs. Defer clipboard
 * reads to the next task so the editor has applied the change; keyup can emit
 * immediately because the keymap already ran on keydown.
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
  el.addEventListener("paste", schedule, true);
  el.addEventListener("cut", schedule, true);
  el.addEventListener("keyup", onChange, true);
  return () => {
    timerWindow().clearTimeout(timer);
    el.removeEventListener("paste", schedule, true);
    el.removeEventListener("cut", schedule, true);
    el.removeEventListener("keyup", onChange, true);
  };
}
