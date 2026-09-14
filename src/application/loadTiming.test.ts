import { describe, expect, it } from "vitest";
import {
  EVAL_STARTED_AT_KEY,
  formatLoadTimingText,
  readEvalStartedAt,
  roundMs,
  withDerivedTimings,
} from "./loadTiming";

describe("roundMs", () => {
  it("rounds to the nearest millisecond", () => {
    expect(roundMs(12.4)).toBe(12);
    expect(roundMs(12.5)).toBe(13);
  });
});

describe("readEvalStartedAt", () => {
  it("returns a finite number from the banner key", () => {
    expect(readEvalStartedAt({ [EVAL_STARTED_AT_KEY]: 41.2 })).toBe(41.2);
  });

  it("ignores missing or non-numeric values", () => {
    expect(readEvalStartedAt({})).toBeUndefined();
    expect(readEvalStartedAt({ [EVAL_STARTED_AT_KEY]: "1" })).toBeUndefined();
    expect(readEvalStartedAt({ [EVAL_STARTED_AT_KEY]: Number.NaN })).toBeUndefined();
  });
});

describe("withDerivedTimings", () => {
  it("sums eval and onload when either is present", () => {
    expect(withDerivedTimings({ evalMs: 100, onloadMs: 20 }).pluginLoadMs).toBe(120);
    expect(withDerivedTimings({ evalMs: 100 }).pluginLoadMs).toBe(100);
    expect(withDerivedTimings({ onloadMs: 20 }).pluginLoadMs).toBe(20);
  });

  it("does not invent a plugin load total from later phases", () => {
    expect(withDerivedTimings({ searchIndexMs: 50 }).pluginLoadMs).toBeUndefined();
  });
});

describe("formatLoadTimingText", () => {
  it("prints known fields in order and skips gaps", () => {
    expect(
      formatLoadTimingText({ evalMs: 2100, onloadMs: 40, searchIndexMs: 90 }, (field) => field),
    ).toBe(["evalMs: 2100ms", "onloadMs: 40ms", "pluginLoadMs: 2140ms", "searchIndexMs: 90ms"].join("\n"));
  });

  it("returns an empty string when nothing was recorded", () => {
    expect(formatLoadTimingText({}, (field) => field)).toBe("");
  });
});
