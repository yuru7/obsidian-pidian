import { describe, expect, it } from "vitest";
import {
  clampThinkingLevel,
  formatModelSelectionLabel,
  hasSelectableThinkingLevels,
  parseOptionalThinkingLevel,
  parseThinkingLevel,
} from "./thinkingLevel";

describe("parseThinkingLevel", () => {
  it("keeps a known level and falls back otherwise", () => {
    expect(parseThinkingLevel("high")).toBe("high");
    expect(parseThinkingLevel("nope")).toBe("medium");
    expect(parseThinkingLevel(undefined, "low")).toBe("low");
  });
});

describe("parseOptionalThinkingLevel", () => {
  it("returns undefined for missing or unknown values", () => {
    expect(parseOptionalThinkingLevel("low")).toBe("low");
    expect(parseOptionalThinkingLevel(undefined)).toBeUndefined();
    expect(parseOptionalThinkingLevel("nope")).toBeUndefined();
  });
});

describe("hasSelectableThinkingLevels", () => {
  it("is false when thinking cannot be turned up", () => {
    expect(hasSelectableThinkingLevels([])).toBe(false);
    expect(hasSelectableThinkingLevels(["off"])).toBe(false);
  });

  it("is true when a non-off level exists", () => {
    expect(hasSelectableThinkingLevels(["off", "low", "high"])).toBe(true);
    expect(hasSelectableThinkingLevels(["low"])).toBe(true);
  });
});

describe("clampThinkingLevel", () => {
  it("keeps a supported level", () => {
    expect(clampThinkingLevel("low", ["off", "low", "high"])).toBe("low");
  });

  it("raises then lowers to the nearest supported level", () => {
    expect(clampThinkingLevel("medium", ["off", "low", "high"])).toBe("high");
    expect(clampThinkingLevel("max", ["off", "low"])).toBe("low");
  });

  it("returns undefined when the catalog has no levels", () => {
    expect(clampThinkingLevel("high", [])).toBeUndefined();
  });
});

describe("formatModelSelectionLabel", () => {
  it("joins provider, model, and thinking level", () => {
    expect(formatModelSelectionLabel("OpenAI", "GPT-5", "high")).toBe("OpenAI GPT-5 (high)");
    expect(formatModelSelectionLabel("OpenAI", "GPT-5")).toBe("OpenAI GPT-5");
  });
});
