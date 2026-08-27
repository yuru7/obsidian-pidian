import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import type { ListedEntry, Note, NoteRepository, SearchHit } from "../domain/notes/NoteRepository";
import { createListFilesTool } from "./ListFilesTool";

class MemoryNotes implements NoteRepository {
  constructor(private readonly listings: Map<string, ListedEntry[]>) {}

  async read(_path: string): Promise<Note> {
    throw new Error("unused");
  }

  async search(_query: string): Promise<SearchHit[]> {
    return [];
  }

  async list(directory: string): Promise<ListedEntry[]> {
    const entries = this.listings.get(directory);
    if (!entries) {
      throw new Error(directory ? `Not a directory: ${directory}` : "Vault root is not a directory.");
    }
    return entries;
  }

  async create(_path: string, _content: string): Promise<Note> {
    throw new Error("unused");
  }

  async delete(_path: string): Promise<void> {
    throw new Error("unused");
  }

  async exists(_path: string): Promise<boolean> {
    return false;
  }
}

describe("list_files", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["notes", []]])),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "notes" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("lists immediate children of a directory", async () => {
    const entries: ListedEntry[] = [
      { path: "notes/sub", name: "sub", type: "folder" },
      { path: "notes/a.md", name: "a.md", type: "file" },
    ];
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["notes", entries]])),
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "notes" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ path: "notes", entries });
  });

  it("treats empty path as the vault root", async () => {
    const entries: ListedEntry[] = [{ path: "notes", name: "notes", type: "folder" }];
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["", entries]])),
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "/" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ path: "", entries });
  });
});
