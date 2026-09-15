import { describe, expect, it } from "vitest";
import { formatUsd } from "./formatUsd";

describe("formatUsd", () => {
  it("trims trailing zeros", () => {
    expect(formatUsd(0)).toBe("0");
    expect(formatUsd(3)).toBe("3");
    expect(formatUsd(0.1)).toBe("0.1");
    expect(formatUsd(0.01)).toBe("0.01");
    expect(formatUsd(0.064)).toBe("0.064");
    expect(formatUsd(0.001)).toBe("0.001");
  });

  it("rounds to three decimal places", () => {
    expect(formatUsd(0.0012)).toBe("0.001");
    expect(formatUsd(0.0015)).toBe("0.002");
    expect(formatUsd(0.0639)).toBe("0.064");
  });

  it("omits amounts smaller than 0.001", () => {
    expect(formatUsd(0.0009)).toBe("0.001>");
    expect(formatUsd(0.000001)).toBe("0.001>");
  });

  it("matches the token tooltip cost suffix", () => {
    expect(`($${formatUsd(3)})`).toBe("($3)");
    expect(`($${formatUsd(0)})`).toBe("($0)");
    expect(`($${formatUsd(0.1)})`).toBe("($0.1)");
    expect(`($${formatUsd(0.01)})`).toBe("($0.01)");
    expect(`($${formatUsd(0.0012)})`).toBe("($0.001)");
    expect(`($${formatUsd(0.0004)})`).toBe("($0.001>)");
  });

  it("treats non-finite values as zero", () => {
    expect(formatUsd(Number.NaN)).toBe("0");
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
