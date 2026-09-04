export interface SearchHit {
  path: string;
  matchType: "filename" | "content";
  snippet: string;
}

export interface NoteSearchIndex {
  search(query: string): Promise<SearchHit[]>;
}
