import { describe, expect, it } from "vitest";
import { shouldSendOnKeyDown } from "./composerSendKey";

function enter(overrides: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
} = {}) {
  return {
    key: "Enter" as const,
    shiftKey: overrides.shiftKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
    nativeEvent: { isComposing: overrides.isComposing ?? false },
  };
}

describe("shouldSendOnKeyDown", () => {
  it("sends on Enter and ignores Shift+Enter by default", () => {
    expect(shouldSendOnKeyDown(enter(), false)).toBe(true);
    expect(shouldSendOnKeyDown(enter({ shiftKey: true }), false)).toBe(false);
    expect(shouldSendOnKeyDown(enter({ ctrlKey: true }), false)).toBe(true);
  });

  it("sends on Ctrl+Enter or Cmd+Enter when the option is on", () => {
    expect(shouldSendOnKeyDown(enter(), true)).toBe(false);
    expect(shouldSendOnKeyDown(enter({ shiftKey: true }), true)).toBe(false);
    expect(shouldSendOnKeyDown(enter({ ctrlKey: true }), true)).toBe(true);
    expect(shouldSendOnKeyDown(enter({ metaKey: true }), true)).toBe(true);
  });

  it("does not send while an IME composition is active", () => {
    expect(shouldSendOnKeyDown(enter({ isComposing: true }), false)).toBe(false);
    expect(shouldSendOnKeyDown(enter({ ctrlKey: true, isComposing: true }), true)).toBe(false);
  });

  it("ignores keys other than Enter", () => {
    expect(
      shouldSendOnKeyDown(
        { key: "Escape", shiftKey: false, ctrlKey: false, metaKey: false, nativeEvent: { isComposing: false } },
        false,
      ),
    ).toBe(false);
  });
});
