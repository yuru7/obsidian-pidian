import { describe, expect, it } from "vitest";
import {
  addFavorite,
  favoriteSelectionKey,
  isFavoriteSelection,
  moveFavorite,
  parseModelFavorites,
  removeFavoriteById,
  toggleFavorite,
  type ModelFavorite,
} from "./modelFavorites";

const openaiHigh: ModelFavorite = {
  id: "fav-1",
  provider: "openai",
  model: "gpt-5",
  thinkingLevel: "high",
};

const anthropic: ModelFavorite = {
  id: "fav-2",
  provider: "anthropic",
  model: "claude-sonnet",
};

describe("favoriteSelectionKey", () => {
  it("treats missing thinking as empty", () => {
    expect(favoriteSelectionKey({ provider: "openai", model: "gpt-5" })).toBe(
      favoriteSelectionKey({ provider: "openai", model: "gpt-5", thinkingLevel: undefined }),
    );
    expect(favoriteSelectionKey({ provider: "openai", model: "gpt-5", thinkingLevel: "high" })).not.toBe(
      favoriteSelectionKey({ provider: "openai", model: "gpt-5" }),
    );
  });
});

describe("isFavoriteSelection", () => {
  it("matches provider, model, and thinking together", () => {
    const favorites = [openaiHigh, anthropic];
    expect(isFavoriteSelection(favorites, { provider: "openai", model: "gpt-5", thinkingLevel: "high" })).toBe(true);
    expect(isFavoriteSelection(favorites, { provider: "openai", model: "gpt-5", thinkingLevel: "low" })).toBe(false);
    expect(isFavoriteSelection(favorites, { provider: "anthropic", model: "claude-sonnet" })).toBe(true);
    expect(isFavoriteSelection(favorites, { provider: "", model: "gpt-5" })).toBe(false);
  });
});

describe("toggleFavorite", () => {
  it("prepends the current selection when it is not favorited", () => {
    const next = toggleFavorite([anthropic], { provider: "openai", model: "gpt-5", thinkingLevel: "high" });
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(
      expect.objectContaining({ provider: "openai", model: "gpt-5", thinkingLevel: "high" }),
    );
    expect(next[0]?.id).toBeTruthy();
    expect(next[1]).toEqual(anthropic);
  });

  it("omits thinkingLevel when the selection has none", () => {
    const next = toggleFavorite([], { provider: "openai", model: "gpt-5" });
    expect(next[0]).toEqual({ id: expect.any(String), provider: "openai", model: "gpt-5" });
    expect("thinkingLevel" in (next[0] ?? {})).toBe(false);
  });

  it("removes every favorite that matches the current selection", () => {
    const duplicate = { ...openaiHigh, id: "fav-1b" };
    expect(toggleFavorite([openaiHigh, duplicate, anthropic], { provider: "openai", model: "gpt-5", thinkingLevel: "high" })).toEqual([
      anthropic,
    ]);
  });

  it("does nothing without a provider and model", () => {
    expect(toggleFavorite([anthropic], { provider: "", model: "gpt-5" })).toEqual([anthropic]);
  });
});

describe("addFavorite", () => {
  it("returns null for a duplicate combination", () => {
    expect(addFavorite([openaiHigh], { provider: "openai", model: "gpt-5", thinkingLevel: "high" })).toBeNull();
  });

  it("prepends a new favorite", () => {
    const next = addFavorite([anthropic], { provider: "openai", model: "gpt-5", thinkingLevel: "medium" });
    expect(next).toHaveLength(2);
    expect(next?.[0]).toEqual(
      expect.objectContaining({ provider: "openai", model: "gpt-5", thinkingLevel: "medium" }),
    );
    expect(next?.[1]).toEqual(anthropic);
  });
});

describe("removeFavoriteById", () => {
  it("drops the matching favorite", () => {
    expect(removeFavoriteById([openaiHigh, anthropic], "fav-1")).toEqual([anthropic]);
  });
});

describe("moveFavorite", () => {
  it("moves an item to another index", () => {
    expect(moveFavorite([openaiHigh, anthropic], 0, 1)).toEqual([anthropic, openaiHigh]);
    expect(moveFavorite([openaiHigh, anthropic], 1, 0)).toEqual([anthropic, openaiHigh]);
  });

  it("returns a copy when the move is a no-op", () => {
    const list = [openaiHigh, anthropic];
    expect(moveFavorite(list, 0, 0)).toEqual(list);
    expect(moveFavorite(list, 0, 0)).not.toBe(list);
    expect(moveFavorite(list, -1, 0)).toEqual(list);
    expect(moveFavorite(list, 0, 9)).toEqual(list);
  });
});

describe("parseModelFavorites", () => {
  it("returns an empty list for missing or invalid data", () => {
    expect(parseModelFavorites(undefined)).toEqual([]);
    expect(parseModelFavorites("nope")).toEqual([]);
    expect(parseModelFavorites([{ provider: "openai" }])).toEqual([]);
  });

  it("keeps valid favorites in order and fills a missing id", () => {
    const parsed = parseModelFavorites([
      { id: "fav-1", provider: "openai", model: "gpt-5", thinkingLevel: "high" },
      { provider: "anthropic", model: "claude-sonnet", thinkingLevel: "nope" },
    ]);
    expect(parsed).toEqual([
      openaiHigh,
      { id: expect.any(String), provider: "anthropic", model: "claude-sonnet" },
    ]);
  });

  it("regenerates duplicate ids", () => {
    const parsed = parseModelFavorites([
      { id: "same", provider: "openai", model: "a" },
      { id: "same", provider: "openai", model: "b" },
    ]);
    expect(parsed[0]?.id).toBe("same");
    expect(parsed[1]?.id).not.toBe("same");
    expect(parsed[1]?.model).toBe("b");
  });
});
