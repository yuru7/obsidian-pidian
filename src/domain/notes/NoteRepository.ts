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

export interface ListedEntry {
  path: string;
  name: string;
  type: "file" | "folder";
}

export interface NoteRepository {
  read(path: string): Promise<Note>;
  search(query: string): Promise<SearchHit[]>;
  list(directory: string): Promise<ListedEntry[]>;
  create(path: string, content: string): Promise<Note>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
