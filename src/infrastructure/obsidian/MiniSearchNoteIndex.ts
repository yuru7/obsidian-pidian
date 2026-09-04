import MiniSearch, { type Options } from "minisearch";
import { tokenizeSearchText } from "./searchNotesTokenizer";

export interface IndexedNote {
  id: string;
  path: string;
  title: string;
  content: string;
}

export interface MiniSearchHit {
  path: string;
  title: string;
  score: number;
  matchedContent: boolean;
}

const MINI_SEARCH_OPTIONS: Options<IndexedNote> = {
  idField: "id",
  fields: ["title", "content"],
  storeFields: ["path", "title"],
  tokenize: tokenizeSearchText,
  searchOptions: {
    prefix: true,
    boost: {
      title: 5,
      content: 1,
    },
  },
};

function createMiniSearch(): MiniSearch<IndexedNote> {
  return new MiniSearch(MINI_SEARCH_OPTIONS);
}

export class MiniSearchNoteIndex {
  private constructor(private searchIndex: MiniSearch<IndexedNote>) {}

  static empty(): MiniSearchNoteIndex {
    return new MiniSearchNoteIndex(createMiniSearch());
  }

  static async fromJSON(value: unknown): Promise<MiniSearchNoteIndex | undefined> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    try {
      const loaded = await MiniSearch.loadJSAsync<IndexedNote>(
        value as ReturnType<MiniSearch<IndexedNote>["toJSON"]>,
        MINI_SEARCH_OPTIONS,
      );
      return new MiniSearchNoteIndex(loaded);
    } catch {
      return undefined;
    }
  }

  toJSON(): ReturnType<MiniSearch<IndexedNote>["toJSON"]> {
    return this.searchIndex.toJSON();
  }

  has(id: string): boolean {
    return this.searchIndex.has(id);
  }

  upsert(note: IndexedNote): void {
    if (this.searchIndex.has(note.id)) {
      this.searchIndex.replace(note);
      return;
    }
    this.searchIndex.add(note);
  }

  addAll(notes: readonly IndexedNote[]): void {
    for (const note of notes) {
      this.upsert(note);
    }
  }

  remove(id: string): void {
    if (!this.searchIndex.has(id)) {
      return;
    }
    this.searchIndex.discard(id);
  }

  search(query: string, limit: number): MiniSearchHit[] {
    const needle = query.trim();
    if (!needle || limit <= 0) {
      return [];
    }
    return this.searchIndex.search(needle).slice(0, limit).flatMap((result) => {
      if (typeof result.path !== "string" || typeof result.title !== "string") {
        return [];
      }
      return [
        {
          path: result.path,
          title: result.title,
          score: result.score,
          matchedContent: matchedContentField(result.match),
        },
      ];
    });
  }

  storedFields(id: string): { path?: unknown; title?: unknown; content?: unknown } | undefined {
    return this.searchIndex.getStoredFields(id);
  }
}

function matchedContentField(match: unknown): boolean {
  if (!match || typeof match !== "object") {
    return false;
  }
  for (const fields of Object.values(match as Record<string, unknown>)) {
    if (Array.isArray(fields) && fields.includes("content")) {
      return true;
    }
  }
  return false;
}
