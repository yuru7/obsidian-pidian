import { describe, expect, it } from "vitest";
import { shouldStartMessageEdit } from "./shouldStartMessageEdit";

function targetWithClosest(tag: string | null): EventTarget {
  return {
    closest: (selector: string) => (tag && selector.split(", ").includes(tag) ? {} : null),
  } as unknown as EventTarget;
}

describe("shouldStartMessageEdit", () => {
  it("starts edit on a plain click", () => {
    expect(shouldStartMessageEdit({ defaultPrevented: false, target: null })).toBe(true);
    expect(shouldStartMessageEdit({ defaultPrevented: false, target: targetWithClosest(null) })).toBe(true);
  });

  it("ignores prevented clicks and interactive targets", () => {
    expect(shouldStartMessageEdit({ defaultPrevented: true, target: null })).toBe(false);
    expect(shouldStartMessageEdit({ defaultPrevented: false, target: targetWithClosest("button") })).toBe(false);
    expect(shouldStartMessageEdit({ defaultPrevented: false, target: targetWithClosest("a") })).toBe(false);
  });

  it("ignores clicks while text is selected", () => {
    const previous = window.getSelection;
    window.getSelection = () => ({ isCollapsed: false }) as Selection;
    try {
      expect(shouldStartMessageEdit({ defaultPrevented: false, target: null })).toBe(false);
    } finally {
      window.getSelection = previous;
    }
  });
});
