import { describe, expect, it } from "vitest";
import { workedSeconds } from "./workedSeconds";

describe("workedSeconds", () => {
  it("rounds milliseconds to at least one second", () => {
    expect(workedSeconds(0)).toBe(1);
    expect(workedSeconds(499)).toBe(1);
    expect(workedSeconds(500)).toBe(1);
    expect(workedSeconds(1499)).toBe(1);
    expect(workedSeconds(1500)).toBe(2);
    expect(workedSeconds(8000)).toBe(8);
  });
});
