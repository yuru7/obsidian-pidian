import { describe, expect, it } from "vitest";
import { sortCatalogModels, type CatalogModel } from "./ModelCatalog";

describe("sortCatalogModels", () => {
  it("sorts by name then id", () => {
    const models: CatalogModel[] = [
      { id: "b", name: "GPT-X", providerId: "openai", thinkingLevels: [] },
      { id: "a", name: "GPT-4o", providerId: "openai", thinkingLevels: [] },
      { id: "c", name: "GPT-4o", providerId: "openai", thinkingLevels: [] },
    ];
    expect(sortCatalogModels(models).map((model) => model.id)).toEqual(["a", "c", "b"]);
  });
});
