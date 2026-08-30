import { parseOptionalThinkingLevel, type ThinkingLevel } from "../domain/agent/thinkingLevel";

export interface ModelFavorite {
  id: string;
  provider: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
}

export function favoriteSelectionKey(selection: {
  provider: string;
  model: string;
  thinkingLevel?: string;
}): string {
  return `${selection.provider}\0${selection.model}\0${selection.thinkingLevel ?? ""}`;
}

export function isFavoriteSelection(
  favorites: readonly ModelFavorite[],
  selection: { provider: string; model: string; thinkingLevel?: string },
): boolean {
  if (!selection.provider || !selection.model) {
    return false;
  }
  const key = favoriteSelectionKey(selection);
  return favorites.some((item) => favoriteSelectionKey(item) === key);
}

export function toggleFavorite(
  favorites: readonly ModelFavorite[],
  selection: { provider: string; model: string; thinkingLevel?: string },
): ModelFavorite[] {
  if (!selection.provider || !selection.model) {
    return [...favorites];
  }
  const key = favoriteSelectionKey(selection);
  if (favorites.some((item) => favoriteSelectionKey(item) === key)) {
    return favorites.filter((item) => favoriteSelectionKey(item) !== key);
  }
  return [createFavorite(selection), ...favorites];
}

export function addFavorite(
  favorites: readonly ModelFavorite[],
  selection: { provider: string; model: string; thinkingLevel?: string },
): ModelFavorite[] | null {
  if (!selection.provider || !selection.model) {
    return null;
  }
  if (isFavoriteSelection(favorites, selection)) {
    return null;
  }
  return [createFavorite(selection), ...favorites];
}

export function removeFavoriteById(favorites: readonly ModelFavorite[], id: string): ModelFavorite[] {
  return favorites.filter((item) => item.id !== id);
}

export function moveFavorite(favorites: readonly ModelFavorite[], fromIndex: number, toIndex: number): ModelFavorite[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= favorites.length ||
    toIndex >= favorites.length
  ) {
    return [...favorites];
  }
  const next = [...favorites];
  const [item] = next.splice(fromIndex, 1);
  if (!item) {
    return [...favorites];
  }
  next.splice(toIndex, 0, item);
  return next;
}

export function parseModelFavorites(raw: unknown): ModelFavorite[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const favorites: ModelFavorite[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    const parsed = parseModelFavorite(item);
    if (!parsed) {
      continue;
    }
    const id = seenIds.has(parsed.id) ? crypto.randomUUID() : parsed.id;
    seenIds.add(id);
    favorites.push(id === parsed.id ? parsed : { ...parsed, id });
  }
  return favorites;
}

function createFavorite(selection: { provider: string; model: string; thinkingLevel?: string }): ModelFavorite {
  const thinkingLevel = parseOptionalThinkingLevel(selection.thinkingLevel);
  return thinkingLevel
    ? {
        id: crypto.randomUUID(),
        provider: selection.provider,
        model: selection.model,
        thinkingLevel,
      }
    : {
        id: crypto.randomUUID(),
        provider: selection.provider,
        model: selection.model,
      };
}

function parseModelFavorite(raw: unknown): ModelFavorite | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const provider = typeof item.provider === "string" ? item.provider.trim() : "";
  const model = typeof item.model === "string" ? item.model.trim() : "";
  if (!provider || !model) {
    return null;
  }
  const id = typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
  const thinkingLevel = parseOptionalThinkingLevel(item.thinkingLevel);
  return thinkingLevel ? { id, provider, model, thinkingLevel } : { id, provider, model };
}
