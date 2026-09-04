export const NOTE_SEARCH_SNIPPET_RADIUS = 80;

export function snippetAround(content: string, index: number, queryLength: number, radius = NOTE_SEARCH_SNIPPET_RADIUS): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + queryLength + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end).replace(/\s+/g, " ")}${suffix}`;
}

export function snippetForQuery(content: string, query: string): string | undefined {
  const needle = query.trim();
  if (!needle) {
    return snippetAround(content, 0, 0);
  }
  const index = content.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return undefined;
  }
  return snippetAround(content, index, needle.length);
}
