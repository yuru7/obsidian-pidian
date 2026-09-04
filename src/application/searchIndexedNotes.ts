import { selectFilenameHits } from "./filenameSearch";
import { snippetForQuery } from "./searchNotesSnippet";
import type { SearchHit } from "../domain/notes/NoteSearchIndex";

export const NOTE_SEARCH_LIMIT = 50;
export const NOTE_SEARCH_SNIPPET_LIMIT = 20;

export interface RankedSearchHit {
  path: string;
  title: string;
  score: number;
  matchedContent: boolean;
}

export async function collectSearchHits(options: {
  query: string;
  paths: readonly string[];
  ranked: readonly RankedSearchHit[];
  readContent: (path: string) => Promise<string | undefined>;
  limit?: number;
  snippetLimit?: number;
}): Promise<SearchHit[]> {
  const query = options.query.trim();
  if (!query) {
    return [];
  }
  const limit = options.limit ?? NOTE_SEARCH_LIMIT;
  const snippetLimit = options.snippetLimit ?? NOTE_SEARCH_SNIPPET_LIMIT;
  const filenameHits = selectFilenameHits([...options.paths], query).slice(0, limit);
  const hits: SearchHit[] = filenameHits.map((path) => ({
    path,
    matchType: "filename",
    snippet: path,
  }));
  if (hits.length >= limit) {
    return hits;
  }

  const filenameHitPaths = new Set(filenameHits);
  const extraFilenameHits: SearchHit[] = [];
  const contentHits: RankedSearchHit[] = [];
  for (const ranked of options.ranked) {
    if (filenameHitPaths.has(ranked.path)) {
      continue;
    }
    if (hits.length + extraFilenameHits.length + contentHits.length >= limit) {
      break;
    }
    if (!ranked.matchedContent) {
      extraFilenameHits.push({
        path: ranked.path,
        matchType: "filename",
        snippet: ranked.path,
      });
      continue;
    }
    contentHits.push(ranked);
  }

  const snippetPaths = new Set(contentHits.slice(0, snippetLimit).map((hit) => hit.path));
  const bodySnippets = new Map<string, string>();
  await Promise.all(
    [...snippetPaths].map(async (path) => {
      const content = await options.readContent(path);
      const snippet = content === undefined ? undefined : snippetForQuery(content, query);
      if (snippet !== undefined) {
        bodySnippets.set(path, snippet);
      }
    }),
  );

  hits.push(...extraFilenameHits);
  for (const hit of contentHits) {
    const snippet = bodySnippets.get(hit.path);
    if (snippetPaths.has(hit.path) && snippet === undefined) {
      hits.push({
        path: hit.path,
        matchType: "filename",
        snippet: hit.path,
      });
      continue;
    }
    hits.push({
      path: hit.path,
      matchType: "content",
      snippet: snippet ?? hit.title,
    });
  }
  return hits;
}
