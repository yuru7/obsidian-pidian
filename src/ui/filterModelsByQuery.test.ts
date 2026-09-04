import { describe, expect, it } from "vitest";
import { clampMenuActiveIndex, filterModelsByQuery } from "./filterModelsByQuery";

describe("filterModelsByQuery", () => {
  const models = [
    { id: "gpt-5.6", name: "GPT-5.6" },
    { id: "gpt-5.6-mini", name: "GPT-5.6 Mini" },
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  ];

  it("returns all models when the query is empty or whitespace", () => {
    expect(filterModelsByQuery(models, "")).toEqual(models);
    expect(filterModelsByQuery(models, "   ")).toEqual(models);
  });

  it("filters by case-insensitive partial name match", () => {
    expect(filterModelsByQuery(models, "gpt")).toEqual([
      { id: "gpt-5.6", name: "GPT-5.6" },
      { id: "gpt-5.6-mini", name: "GPT-5.6 Mini" },
    ]);
    expect(filterModelsByQuery(models, "SONNET")).toEqual([
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("treats consecutive spaces as a single space", () => {
    expect(filterModelsByQuery(models, "GPT-5.6  Mini")).toEqual([
      { id: "gpt-5.6-mini", name: "GPT-5.6 Mini" },
    ]);
    expect(filterModelsByQuery(models, "claude   sonnet")).toEqual([
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterModelsByQuery(models, "no-such-model")).toEqual([]);
  });
});

describe("clampMenuActiveIndex", () => {
  it("returns -1 when there are no items", () => {
    expect(clampMenuActiveIndex(0, 0)).toBe(-1);
    expect(clampMenuActiveIndex(2, 0)).toBe(-1);
  });

  it("clamps to the first and last items", () => {
    expect(clampMenuActiveIndex(-1, 3)).toBe(0);
    expect(clampMenuActiveIndex(0, 3)).toBe(0);
    expect(clampMenuActiveIndex(1, 3)).toBe(1);
    expect(clampMenuActiveIndex(3, 3)).toBe(2);
  });
});
