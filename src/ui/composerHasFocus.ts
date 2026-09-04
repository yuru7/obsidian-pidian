export function composerHasFocus(
  composerEl: { contains: (node: Node | null) => boolean } | null,
  activeElement: Node | null,
): boolean {
  return Boolean(composerEl && activeElement && composerEl.contains(activeElement));
}

export function composerOwnsKeyEvent(
  composerEl: { contains: (node: Node | null) => boolean } | null,
  event: { target?: EventTarget | null },
  activeElement: Node | null,
): boolean {
  const target = event.target;
  if (composerEl && isNode(target) && composerEl.contains(target)) {
    return true;
  }
  return composerHasFocus(composerEl, activeElement);
}

function isNode(value: EventTarget | null | undefined): value is Node {
  return Boolean(value && typeof value === "object" && "nodeType" in value);
}
