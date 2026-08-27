import { describe, expect, it, vi } from "vitest";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { computeRevision } from "../application/revision";
import type { Note, NoteRepository, SearchHit } from "../domain/notes/NoteRepository";
import { NOTE_NOT_ACTIVE_EDITOR, type NoteEditor, type Replacement } from "../domain/notes/NoteEditor";
import type { OpenFileResult, WorkspaceNavigator, WorkspaceTab } from "../domain/workspace/WorkspaceNavigator";
import { applyReplacementsToText } from "../application/replacements";
import { createEditNoteTool } from "./EditNoteTool";
import { createPidianTools } from "./createPidianTools";

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

class MemoryWorkspace implements WorkspaceNavigator {
  async openFile(_path: string): Promise<OpenFileResult> {
    throw new Error("unused");
  }

  async listTabs(): Promise<WorkspaceTab[]> {
    return [];
  }

  async focusTab(_target: { tabId?: string; path?: string }): Promise<WorkspaceTab> {
    throw new Error("unused");
  }
}

class MemoryEditor implements NoteEditor {
  readonly calls: Replacement[][] = [];
  active = true;

  constructor(private readonly notes: MemoryNotes, private readonly files: Map<string, string>) {}

  async requireActive(_path: string): Promise<void> {
    if (!this.active) {
      throw new Error(NOTE_NOT_ACTIVE_EDITOR);
    }
  }

  async applyReplacements(path: string, replacements: Replacement[]): Promise<string> {
    this.calls.push(replacements);
    const note = await this.notes.read(path);
    const applied = applyReplacementsToText(note.content, replacements);
    if (!applied.ok) {
      throw new Error(applied.error);
    }
    this.files.set(path, applied.content);
    return applied.content;
  }
}

describe("edit_note", () => {
  it("refuses edits when permission is deny and never calls the editor", async () => {
    const files = new Map([["a.md", "hello"]]);
    const notes = new MemoryNotes(files);
    const editor = new MemoryEditor(notes, files);
    const tracker = new ReadRevisionTracker();
    const revision = computeRevision("hello");
    tracker.recordRead("s1", "a.md", revision);
    const tool = createEditNoteTool({
      sessionId: "s1",
      notes,
      editor,
      tracker,
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({
      path: "a.md",
      revision,
      replacements: [{ oldText: "hello", newText: "hi" }],
    });
    expect(result.isError).toBe(true);
    expect(editor.calls).toHaveLength(0);
    expect(files.get("a.md")).toBe("hello");
  });

  it("refuses edits when the note changed after it was read", async () => {
    const files = new Map([["a.md", "hello"]]);
    const notes = new MemoryNotes(files);
    const editor = new MemoryEditor(notes, files);
    const tracker = new ReadRevisionTracker();
    tracker.recordRead("s1", "a.md", computeRevision("hello"));
    files.set("a.md", "changed");
    const tool = createEditNoteTool({
      sessionId: "s1",
      notes,
      editor,
      tracker,
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "allow", delete: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({
      path: "a.md",
      revision: computeRevision("hello"),
      replacements: [{ oldText: "hello", newText: "hi" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("The note changed after it was read");
    expect(editor.calls).toHaveLength(0);
  });

  it("refuses edits when the note is not the active editor", async () => {
    const files = new Map([["a.md", "hello"]]);
    const notes = new MemoryNotes(files);
    const editor = new MemoryEditor(notes, files);
    editor.active = false;
    const tracker = new ReadRevisionTracker();
    const revision = computeRevision("hello");
    tracker.recordRead("s1", "a.md", revision);
    const tool = createEditNoteTool({
      sessionId: "s1",
      notes,
      editor,
      tracker,
      permissions: new PermissionService(
        () => ({ read: "allow", create: "deny", edit: "allow", delete: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({
      path: "a.md",
      revision,
      replacements: [{ oldText: "hello", newText: "hi" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content).toBe(NOTE_NOT_ACTIVE_EDITOR);
    expect(editor.calls).toHaveLength(0);
    expect(files.get("a.md")).toBe("hello");
  });
});

describe("read then edit flow", () => {
  it("updates revision after a successful edit", async () => {
    const files = new Map([["a.md", "hello world"]]);
    const notes = new MemoryNotes(files);
    const editor = new MemoryEditor(notes, files);
    const tracker = new ReadRevisionTracker();
    const confirm = vi.fn(async () => true);
    const tools = createPidianTools({
      sessionId: "s1",
      notes,
      editor,
      workspace: new MemoryWorkspace(),
      tracker,
      permissions: new PermissionService(
        () => ({ read: "allow", create: "allow", edit: "allow", delete: "deny" }),
        { confirm },
      ),
    });
    const read = tools.find((tool) => tool.name === "read_note");
    const edit = tools.find((tool) => tool.name === "edit_note");
    if (!read || !edit) {
      throw new Error("tools missing");
    }

    const readResult = await read.execute({ path: "a.md" });
    const payload = JSON.parse(readResult.content) as { revision: string };
    const editResult = await edit.execute({
      path: "a.md",
      revision: payload.revision,
      replacements: [{ oldText: "world", newText: "pidian" }],
    });
    expect(editResult.isError).toBeFalsy();
    expect(files.get("a.md")).toBe("hello pidian");
    const next = JSON.parse(editResult.content) as { revision: string };
    expect(next.revision).toBe(computeRevision("hello pidian"));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("inserts content into an empty note", async () => {
    const files = new Map([["aaa.md", ""]]);
    const notes = new MemoryNotes(files);
    const editor = new MemoryEditor(notes, files);
    const tracker = new ReadRevisionTracker();
    const tools = createPidianTools({
      sessionId: "s1",
      notes,
      editor,
      workspace: new MemoryWorkspace(),
      tracker,
      permissions: new PermissionService(
        () => ({ read: "allow", create: "allow", edit: "allow", delete: "deny" }),
        { confirm: async () => true },
      ),
    });
    const read = tools.find((tool) => tool.name === "read_note");
    const edit = tools.find((tool) => tool.name === "edit_note");
    if (!read || !edit) {
      throw new Error("tools missing");
    }

    const readResult = await read.execute({ path: "aaa.md" });
    const payload = JSON.parse(readResult.content) as { revision: string };
    const editResult = await edit.execute({
      path: "aaa.md",
      revision: payload.revision,
      replacements: [{ oldText: "", newText: "aiueo" }],
    });
    expect(editResult.isError).toBeFalsy();
    expect(files.get("aaa.md")).toBe("aiueo");
  });
});
