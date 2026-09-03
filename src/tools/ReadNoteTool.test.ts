import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { computeRevision } from "../application/revision";
import type { Note, NoteRepository, SearchHit } from "../domain/notes/NoteRepository";
import { createReadNoteTool } from "./ReadNoteTool";

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

  async create(_path: string, _content: string): Promise<Note> {
    throw new Error("unused");
  }

  async delete(_path: string): Promise<void> {
    throw new Error("unused");
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

function allowRead() {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
    { confirm: async () => true },
  );
}

describe("read_note", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["a.md", "hello"]])),
      tracker: new ReadRevisionTracker(),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "a.md" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("returns a line range and records the full-file revision", async () => {
    const content = ["one", "two", "three", "four"].join("\n");
    const tracker = new ReadRevisionTracker();
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["a.md", content]])),
      tracker,
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "a.md", offset: 2, limit: 2 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      path: "a.md",
      content: "two\nthree",
      beforeContext: "one\n",
      afterContext: "\nfour",
      revision: computeRevision(content),
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      truncated: true,
      nextOffset: 4,
    });
    expect(tracker.getRevision("s1", "a.md")).toBe(computeRevision(content));
  });

  it("defaults to offset 1 for files without a cursor, such as Canvas", async () => {
    const content = '{"nodes":[]}';
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["maps/board.canvas", content]])),
      tracker: new ReadRevisionTracker(),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "maps/board.canvas" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      path: "maps/board.canvas",
      content,
      beforeContext: "",
      afterContext: "",
      startLine: 1,
      endLine: 1,
      totalLines: 1,
      truncated: false,
    });
  });

  it("rejects a non-positive offset", async () => {
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["a.md", "hello"]])),
      tracker: new ReadRevisionTracker(),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "a.md", offset: 0 });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("offset must be a positive integer.");
  });

  it("rejects files that are not Markdown or Canvas", async () => {
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["img/photo.png", "binary"]])),
      tracker: new ReadRevisionTracker(),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "img/photo.png" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Not a note");
  });

  it("clips by startColumn and endColumn and returns surrounding context", async () => {
    const content = ["abcdef", "ghijkl", "mnopqr"].join("\n");
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["a.md", content]])),
      tracker: new ReadRevisionTracker(),
      permissions: allowRead(),
    });

    const result = await tool.execute({
      path: "a.md",
      offset: 1,
      limit: 3,
      startColumn: 4,
      endColumn: 3,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      path: "a.md",
      content: "def\nghijkl\nmn",
      beforeContext: "abc",
      afterContext: "opqr",
      revision: computeRevision(content),
      startLine: 1,
      endLine: 3,
      startColumn: 4,
      endColumn: 3,
      totalLines: 3,
      truncated: false,
    });
  });

  it("rejects a non-positive startColumn", async () => {
    const tool = createReadNoteTool({
      sessionId: "s1",
      notes: new MemoryNotes(new Map([["a.md", "hello"]])),
      tracker: new ReadRevisionTracker(),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "a.md", startColumn: 0 });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("startColumn must be a positive integer.");
  });
});
