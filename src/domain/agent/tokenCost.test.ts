import { describe, expect, it } from "vitest";
import { sumTokenUsageCost, tokenUsageCost, usableCatalogModelCost } from "./tokenCost";
import type { CatalogModelCost } from "./ModelCatalog";

const rates: CatalogModelCost = {
  input: 3,
  output: 15,
  cacheRead: 0.5,
  cacheWrite: 3.75,
};

describe("usableCatalogModelCost", () => {
  it("rejects missing or non-finite rates", () => {
    expect(usableCatalogModelCost(undefined)).toBeUndefined();
    expect(usableCatalogModelCost({ ...rates, input: Number.NaN })).toBeUndefined();
  });

  it("keeps finite tiers and drops broken ones", () => {
    expect(
      usableCatalogModelCost({
        ...rates,
        tiers: [
          { ...rates, input: 2, inputTokensAbove: 1000 },
          { ...rates, input: Number.POSITIVE_INFINITY, inputTokensAbove: 2000 },
        ],
      }),
    ).toEqual({
      ...rates,
      tiers: [{ ...rates, input: 2, inputTokensAbove: 1000 }],
    });
  });
});

describe("tokenUsageCost", () => {
  it("returns undefined when catalog rates are missing", () => {
    expect(tokenUsageCost({ input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 }, undefined)).toBeUndefined();
  });

  it("multiplies tokens by USD-per-million rates", () => {
    expect(tokenUsageCost({ input: 1_000_000, output: 2_000_000, cacheRead: 3_000_000, cacheWrite: 4_000_000 }, rates)).toEqual({
      input: 3,
      output: 30,
      cacheRead: 1.5,
      cacheWrite: 15,
    });
  });

  it("uses the highest matching input-token tier for the whole request", () => {
    const tiered: CatalogModelCost = {
      ...rates,
      tiers: [
        { ...rates, input: 6, output: 30, cacheRead: 0.6, cacheWrite: 7.5, inputTokensAbove: 1000 },
        { ...rates, input: 9, output: 45, cacheRead: 0.9, cacheWrite: 11.25, inputTokensAbove: 5000 },
      ],
    };
    expect(tokenUsageCost({ input: 800, output: 1_000_000, cacheRead: 100, cacheWrite: 50 }, tiered)?.output).toBe(15);
    expect(tokenUsageCost({ input: 900, output: 1_000_000, cacheRead: 100, cacheWrite: 1 }, tiered)?.output).toBe(30);
    expect(tokenUsageCost({ input: 4000, output: 1_000_000, cacheRead: 1000, cacheWrite: 1 }, tiered)?.output).toBe(45);
  });
});

describe("sumTokenUsageCost", () => {
  it("returns undefined when catalog rates are missing", () => {
    expect(
      sumTokenUsageCost([{ usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0 } }], undefined),
    ).toBeUndefined();
  });

  it("sums per-message costs instead of pricing the combined token totals", () => {
    const tiered: CatalogModelCost = {
      input: 1,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      tiers: [{ input: 2, output: 0, cacheRead: 0, cacheWrite: 0, inputTokensAbove: 1000 }],
    };
    const summed = sumTokenUsageCost(
      [
        { usage: { input: 500, output: 0, cacheRead: 0, cacheWrite: 0 } },
        { usage: { input: 1500, output: 0, cacheRead: 0, cacheWrite: 0 } },
      ],
      tiered,
    );
    expect(summed?.input).toBeCloseTo(500 / 1_000_000 + (1500 * 2) / 1_000_000);
  });

  it("skips messages without usage and still returns zeros when rates exist", () => {
    expect(sumTokenUsageCost([{ usage: undefined }], rates)).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});
