export const MODEL_SEARCH_DEBOUNCE_MS = 200;

function collapseSpaces(value: string): string {
  return value.trim().replace(/ +/g, " ");
}

export function filterModelsByQuery<T extends { name: string }>(
  models: readonly T[],
  query: string,
): T[] {
  const needle = collapseSpaces(query).toLowerCase();
  if (!needle) {
    return [...models];
  }
  return models.filter((model) => collapseSpaces(model.name).toLowerCase().includes(needle));
}

export function clampMenuActiveIndex(index: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= count) {
    return count - 1;
  }
  return index;
}
