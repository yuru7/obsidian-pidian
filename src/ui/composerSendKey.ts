export const IME_ENTER_KEYCODE = 229;

export type ComposerKeyEvent = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

export function keyIsComposing(event: ComposerKeyEvent): boolean {
  const isComposing = event.nativeEvent?.isComposing ?? event.isComposing ?? false;
  const keyCode = event.nativeEvent?.keyCode ?? event.keyCode ?? 0;
  return isComposing || keyCode === IME_ENTER_KEYCODE;
}

export function shouldSendOnKeyDown(event: ComposerKeyEvent, sendWithCtrlEnter: boolean): boolean {
  if (event.key !== "Enter" || keyIsComposing(event)) {
    return false;
  }
  if (sendWithCtrlEnter) {
    return Boolean(event.ctrlKey || event.metaKey);
  }
  return !event.shiftKey;
}
