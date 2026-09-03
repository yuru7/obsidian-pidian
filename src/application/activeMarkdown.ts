import { hasContextColumnRange, type ContextSnapshot } from "../domain/notes/ContextSnapshot";

export interface MarkdownEditorSource {
  notePath: string;
  fromLine: number;
  toLine: number;
  fromColumn: number;
  toColumn: number;
}

export function pickMarkdownSource<T extends { notePath: string }>(
  sources: Array<T | undefined>,
): T | undefined {
  for (const source of sources) {
    if (source?.notePath) {
      return source;
    }
  }
  return undefined;
}

export function pickMarkdownSourceForPath<T extends { notePath: string }>(
  path: string,
  sources: Array<T | undefined>,
): T | undefined {
  return pickMarkdownSource(sources.filter((source) => source?.notePath === path));
}

export function snapshotFromEditorSource(source: MarkdownEditorSource): ContextSnapshot {
  const startLine = source.fromLine + 1;
  const endLine = source.toLine + 1;
  const startColumn = source.fromColumn + 1;
  const endColumn = source.toColumn + 1;
  const selected = source.fromLine !== source.toLine || source.fromColumn !== source.toColumn;
  return {
    notePath: source.notePath,
    startLine,
    endLine,
    ...(selected ? { startColumn, endColumn } : {}),
  };
}

export function formatLineRange(range: {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}): string {
  if (hasContextColumnRange(range) && (range.startLine !== range.endLine || range.startColumn !== range.endColumn)) {
    return `L${range.startLine}:C${range.startColumn}-L${range.endLine}:C${range.endColumn}`;
  }
  return range.startLine === range.endLine ? `L${range.startLine}` : `L${range.startLine}-L${range.endLine}`;
}
