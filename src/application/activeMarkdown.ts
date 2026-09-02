import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";

export interface MarkdownEditorSource {
  notePath: string;
  fromLine: number;
  toLine: number;
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
  return {
    notePath: source.notePath,
    startLine: source.fromLine + 1,
    endLine: source.toLine + 1,
  };
}

export function formatLineRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
}
