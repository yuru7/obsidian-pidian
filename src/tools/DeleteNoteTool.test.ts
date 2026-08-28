import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import { computeRevision } from "../application/revision";
import type { Note, NoteRepository, SearchHit } from "../domain/notes/NoteRepository";
import { createDeleteNoteTool } from "./DeleteNoteTool";

class MemoryNotes implements NoteRepository {
  constructor(private readonly files: Map<string, string>) {}

  async read(path: string): Promise<Note> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`Note not found: ${path}`);
    }
    return { path, content, revision: computeRevision(content) };
  }

  async search(_query: string): Promise<SearchHit[]> {
    return [];
  }

  async list(_directory: string) {
    return [];
  }

  async create(path: string, content: string): Promise<Note> {
    this.files.set(path, content);
    return this.read(path);
  }

  async delete(path: string): Promise<void> {
    if (!this.files.has(path)) {
      throw new Error(`Note not found: ${path}`);
    }
    this.files.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

describe("delete_note", () => {
  it("refuses deletion when permission is deny", async () => {
    const files = new Map([["a.md", "hello"]]);
    const tool = createDeleteNoteTool({
      notes: new MemoryNotes(files),
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "a.md" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
    expect(files.get("a.md")).toBe("hello");
  });

  it("deletes an existing note when permission is allow", async () => {
    const files = new Map([["a.md", "hello"]]);
    const tool = createDeleteNoteTool({
      notes: new MemoryNotes(files),
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "a.md" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ path: "a.md", deleted: true });
    expect(files.has("a.md")).toBe(false);
  });

  it("returns an error when the note does not exist", async () => {
    const tool = createDeleteNoteTool({
      notes: new MemoryNotes(new Map()),
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "missing.md" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Note not found");
  });
});
