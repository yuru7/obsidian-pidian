import { type Scope } from "obsidian";
import { useLayoutEffect, useRef } from "react";

/** View-local Esc abort. Active while this ItemView is focused (not only the textarea). */
export function useAbortHotkeyScope(
  scope: Scope | null,
  streaming: boolean,
  shouldAbort: () => boolean,
  onAbort: () => void,
): void {
  const shouldAbortRef = useRef(shouldAbort);
  const onAbortRef = useRef(onAbort);
  shouldAbortRef.current = shouldAbort;
  onAbortRef.current = onAbort;

  useLayoutEffect(() => {
    if (!scope || !streaming) {
      return;
    }
    const handler = scope.register([], "Escape", (event) => {
      if (event.isComposing || !shouldAbortRef.current()) {
        return;
      }
      onAbortRef.current();
      return false;
    });
    return () => {
      scope.unregister(handler);
    };
  }, [scope, streaming]);
}
