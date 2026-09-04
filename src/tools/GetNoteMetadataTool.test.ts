import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import type { NoteMetadata, NoteMetadataField, NoteMetadataIndex, VaultLinks, VaultLinksQuery } from "../domain/notes/NoteMetadata";
import { createGetNoteMetadataTool } from "./GetNoteMetadataTool";

class MemoryMetadata implements NoteMetadataIndex {
  constructor(
    private readonly notes: Map<string, NoteMetadata>,
    readonly calls: { path: string; fields: NoteMetadataField[] }[] = [],
  ) {}

  async getNoteMetadata(path: string, fields: NoteMetadataField[]): Promise<NoteMetadata> {
    this.calls.push({ path, fields });
    const note = this.notes.get(path);
    if (!note) {
      throw new Error(`Note not found: ${path}`);
    }
    return note;
  }

  async getVaultLinks(_query: VaultLinksQuery): Promise<VaultLinks> {
    throw new Error("unused");
  }
}

function allowRead() {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
    { confirm: async () => true },
  );
}

describe("get_note_metadata", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createGetNoteMetadataTool({
      metadata: new MemoryMetadata(new Map()),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });
    const result = await tool.execute({ path: "a.md" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("returns metadata JSON", async () => {
    const metadata = new MemoryMetadata(
      new Map([
        [
          "notes/a.md",
          {
            path: "notes/a.md",
            tags: ["#alpha"],
            headings: [{ heading: "Intro", level: 1, line: 5 }],
          },
        ],
      ]),
    );
    const tool = createGetNoteMetadataTool({ metadata, permissions: allowRead() });
    const result = await tool.execute({ path: "notes/a.md", fields: ["tags", "headings"] });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      path: "notes/a.md",
      tags: ["#alpha"],
      headings: [{ heading: "Intro", level: 1, line: 5 }],
    });
    expect(metadata.calls).toEqual([{ path: "notes/a.md", fields: ["tags", "headings"] }]);
  });

  it("rejects a missing path", async () => {
    const tool = createGetNoteMetadataTool({
      metadata: new MemoryMetadata(new Map()),
      permissions: allowRead(),
    });
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content).toBe("path is required.");
  });

  it("rejects Canvas and other non-Markdown files", async () => {
    const tool = createGetNoteMetadataTool({
      metadata: new MemoryMetadata(new Map()),
      permissions: allowRead(),
    });
    const canvas = await tool.execute({ path: "maps/board.canvas" });
    expect(canvas.isError).toBe(true);
    expect(canvas.content).toContain("Not a Markdown file");
    const image = await tool.execute({ path: "img/photo.png" });
    expect(image.isError).toBe(true);
    expect(image.content).toContain("Not a note");
  });

  it("returns the repository error when the note does not exist", async () => {
    const tool = createGetNoteMetadataTool({
      metadata: new MemoryMetadata(new Map()),
      permissions: allowRead(),
    });
    const result = await tool.execute({ path: "missing.md" });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("Note not found: missing.md");
  });

  it("rejects an unknown field name", async () => {
    const tool = createGetNoteMetadataTool({
      metadata: new MemoryMetadata(new Map()),
      permissions: allowRead(),
    });
    const result = await tool.execute({ path: "a.md", fields: ["blocks"] });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("unknown value: blocks");
  });
});
