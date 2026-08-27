export interface Note {
  path: string;
  content: string;
  revision: string;
}

export interface SearchHit {
  path: string;
  matchType: "filename" | "content";
  snippet: string;
}

export interface NoteRepository {
  read(path: string): Promise<Note>;
  search(query: string): Promise<SearchHit[]>;
  create(path: string, content: string): Promise<Note>;
  exists(path: string): Promise<boolean>;
}
