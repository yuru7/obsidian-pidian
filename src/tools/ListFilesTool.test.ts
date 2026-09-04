import { describe, expect, it } from "vitest";
import { NAME_GLOB_RULE } from "../application/nameGlob";
import { PermissionService } from "../application/PermissionService";
import type { ListedEntry, Note, NoteRepository } from "../domain/notes/NoteRepository";
import { createListFilesTool } from "./ListFilesTool";

class MemoryNotes implements NoteRepository {
  constructor(private readonly listings: Map<string, ListedEntry[]>) {}

  async read(_path: string): Promise<Note> {
    throw new Error("unused");
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

function allowRead() {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
    { confirm: async () => true },
  );
}

const MIXED_ENTRIES: ListedEntry[] = [
  { path: "notes/sub", name: "sub", type: "folder" },
  { path: "notes/a.md", name: "a.md", type: "file" },
  { path: "notes/data.json", name: "data.json", type: "file" },
  { path: "notes/DATA.JSON", name: "DATA.JSON", type: "file" },
  { path: "notes/data.json.bak", name: "data.json.bak", type: "file" },
  { path: "notes/configs.json", name: "configs.json", type: "folder" },
];

describe("list_files", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["notes", []]])),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
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
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "notes" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ path: "notes", entries });
  });

  it("treats empty path as the vault root", async () => {
    const entries: ListedEntry[] = [{ path: "notes", name: "notes", type: "folder" }];
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["", entries]])),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "/" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ path: "", entries });
  });

  it("filters immediate names with glob and keeps matching folders", async () => {
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["notes", MIXED_ENTRIES]])),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "notes", glob: "*.json" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      path: "notes",
      glob: "*.json",
      entries: [
        { path: "notes/data.json", name: "data.json", type: "file" },
        { path: "notes/DATA.JSON", name: "DATA.JSON", type: "file" },
        { path: "notes/configs.json", name: "configs.json", type: "folder" },
      ],
    });
  });

  it("returns an empty list when glob matches nothing", async () => {
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["notes", MIXED_ENTRIES]])),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "notes", glob: "*.png" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ path: "notes", glob: "*.png", entries: [] });
  });

  it("rejects recursive or path glob patterns", async () => {
    const tool = createListFilesTool({
      notes: new MemoryNotes(new Map([["notes", MIXED_ENTRIES]])),
      permissions: allowRead(),
    });

    const recursive = await tool.execute({ path: "notes", glob: "**/*.json" });
    expect(recursive.isError).toBe(true);
    expect(recursive.content).toBe(NAME_GLOB_RULE);

    const nested = await tool.execute({ path: "notes", glob: "sub/*.json" });
    expect(nested.isError).toBe(true);
    expect(nested.content).toBe(NAME_GLOB_RULE);
  });
});
