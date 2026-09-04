import { describe, expect, it } from "vitest";
import { shouldAbortOnEscape } from "./composerAbortKey";

function escapeEvent(isComposing = false) {
  return {
    key: "Escape" as const,
    nativeEvent: { isComposing },
  };
}

describe("shouldAbortOnEscape", () => {
  it("aborts while streaming with an empty composer", () => {
    expect(shouldAbortOnEscape(escapeEvent(), true, true)).toBe(true);
  });

  it("does not abort when the composer has text", () => {
    expect(shouldAbortOnEscape(escapeEvent(), true, false)).toBe(false);
  });

  it("does not abort when nothing is streaming", () => {
    expect(shouldAbortOnEscape(escapeEvent(), false, true)).toBe(false);
  });

  it("does not abort while an IME composition is active", () => {
    expect(shouldAbortOnEscape(escapeEvent(true), true, true)).toBe(false);
    expect(shouldAbortOnEscape({ key: "Escape", isComposing: true }, true, true)).toBe(false);
  });

  it("ignores keys other than Escape", () => {
    expect(
      shouldAbortOnEscape(
        { key: "Enter", nativeEvent: { isComposing: false } },
        true,
        true,
      ),
    ).toBe(false);
  });
});
