export function shouldAbortOnEscape(
  event: {
    key: string;
    nativeEvent: { isComposing: boolean };
  },
  streaming: boolean,
  empty: boolean,
): boolean {
  return event.key === "Escape" && !event.nativeEvent.isComposing && streaming && empty;
}
