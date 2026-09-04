import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import type { NoteSearchIndex, SearchHit } from "../domain/notes/NoteSearchIndex";
import { createSearchNotesTool } from "./SearchNotesTool";

class MemoryNoteSearch implements NoteSearchIndex {
  constructor(private readonly hits: SearchHit[]) {}

  async search(_query: string): Promise<SearchHit[]> {
    return this.hits;
  }
}

describe("search_notes", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createSearchNotesTool({
      noteSearch: new MemoryNoteSearch([{ path: "a.md", matchType: "filename", snippet: "a.md" }]),
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
      noteSearch: new MemoryNoteSearch(hits),
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
