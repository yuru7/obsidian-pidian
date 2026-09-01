export function shouldSendOnKeyDown(
  event: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    nativeEvent: { isComposing: boolean };
  },
  sendWithCtrlEnter: boolean,
): boolean {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) {
    return false;
  }
  if (sendWithCtrlEnter) {
    return event.ctrlKey || event.metaKey;
  }
  return !event.shiftKey;
}
