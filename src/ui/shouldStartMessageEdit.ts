export function shouldStartMessageEdit(event: {
  defaultPrevented: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.defaultPrevented) {
    return false;
  }
  const target = event.target;
  if (isElementWithClosest(target) && target.closest("a, button, textarea, input")) {
    return false;
  }
  const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
  if (selection && !selection.isCollapsed) {
    return false;
  }
  return true;
}

function isElementWithClosest(
  target: EventTarget | null,
): target is EventTarget & { closest: (selector: string) => unknown } {
  return !!target && typeof (target as { closest?: unknown }).closest === "function";
}
