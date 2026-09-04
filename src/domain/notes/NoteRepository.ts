export interface Note {
  path: string;
  content: string;
  revision: string;
}

export interface ListedEntry {
  path: string;
  name: string;
  type: "file" | "folder";
}

export interface NoteRepository {
  read(path: string): Promise<Note>;
  list(directory: string): Promise<ListedEntry[]>;
  create(path: string, content: string): Promise<Note>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
