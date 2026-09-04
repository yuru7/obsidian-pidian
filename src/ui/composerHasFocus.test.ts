import { describe, expect, it } from "vitest";
import { composerHasFocus, composerOwnsKeyEvent } from "./composerHasFocus";

describe("composerHasFocus", () => {
  it("is true when the active element is inside the composer", () => {
    const active = {} as Node;
    const composer = { contains: (node: Node | null) => node === active };
    expect(composerHasFocus(composer, active)).toBe(true);
  });

  it("is false when focus is outside, missing, or the composer is unmounted", () => {
    const active = {} as Node;
    const composer = { contains: () => false };
    expect(composerHasFocus(composer, active)).toBe(false);
    expect(composerHasFocus(composer, null)).toBe(false);
    expect(composerHasFocus(null, active)).toBe(false);
  });
});

describe("composerOwnsKeyEvent", () => {
  it("is true when the event target is inside the composer", () => {
    const target = { nodeType: 1 } as Node;
    const composer = { contains: (node: Node | null) => node === target };
    expect(composerOwnsKeyEvent(composer, { target }, null)).toBe(true);
  });

  it("falls back to the active element when the event has no target", () => {
    const active = { nodeType: 1 } as Node;
    const composer = { contains: (node: Node | null) => node === active };
    expect(composerOwnsKeyEvent(composer, {}, active)).toBe(true);
    expect(composerOwnsKeyEvent(composer, { target: null }, null)).toBe(false);
  });
});
