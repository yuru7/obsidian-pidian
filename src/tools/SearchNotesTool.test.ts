import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import type { Note, NoteRepository, SearchHit } from "../domain/notes/NoteRepository";
import { createSearchNotesTool } from "./SearchNotesTool";

class MemoryNotes implements NoteRepository {
  constructor(private readonly hits: SearchHit[]) {}

  async read(_path: string): Promise<Note> {
    throw new Error("unused");
  }

  async search(_query: string): Promise<SearchHit[]> {
    return this.hits;
  }

  async list(_directory: string) {
    return [];
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

describe("search_notes", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createSearchNotesTool({
      notes: new MemoryNotes([{ path: "a.md", matchType: "filename", snippet: "a.md" }]),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ query: "hello" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("returns hits when read is allow", async () => {
    const hits: SearchHit[] = [{ path: "a.md", matchType: "content", snippet: "hello" }];
    const tool = createSearchNotesTool({
      notes: new MemoryNotes(hits),
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ query: "hello" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ query: "hello", hits });
  });
});
