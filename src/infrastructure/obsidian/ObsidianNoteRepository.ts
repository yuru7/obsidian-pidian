import { MarkdownView, TFile, TFolder, type App } from "obsidian";
import type { ListedEntry, Note, NoteRepository } from "../../domain/notes/NoteRepository";
import { computeRevision } from "../../application/revision";
import { assertNoteFilePath } from "../../application/noteFile";
import { assertSafeDirectoryPath, assertSafeNotePath, isRestrictedVaultPath } from "../../application/notePath";

export class ObsidianNoteRepository implements NoteRepository {
  constructor(private readonly app: App) {}

  async read(path: string): Promise<Note> {
    return this.readNormalized(assertNoteFilePath(path));
  }

  async exists(path: string): Promise<boolean> {
    const normalized = assertSafeNotePath(path);
    return this.app.vault.getAbstractFileByPath(normalized) instanceof TFile;
  }

  async list(directory: string): Promise<ListedEntry[]> {
    const normalized = assertSafeDirectoryPath(directory);
    const folder = normalized === "" ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(normalized);
    if (!(folder instanceof TFolder)) {
      throw new Error(normalized ? `Not a directory: ${normalized}` : "Vault root is not a directory.");
    }
    const entries: ListedEntry[] = [];
    for (const child of folder.children) {
      if (isRestrictedVaultPath(child.path)) {
        continue;
      }
      entries.push({
        path: child.path,
        name: child.name,
        type: child instanceof TFolder ? "folder" : "file",
      });
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  async create(path: string, content: string): Promise<Note> {
    const normalized = assertSafeNotePath(path);
    const folder = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (folder) {
      await this.ensureFolder(folder);
    }
    await this.app.vault.create(normalized, content);
    return this.readNormalized(normalized);
  }

  async delete(path: string): Promise<void> {
    const normalized = assertSafeNotePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${normalized}`);
    }
    await this.app.fileManager.trashFile(file);
  }

  private async readNormalized(path: string): Promise<Note> {
    const content = await this.readContent(path);
    return {
      path,
      content,
      revision: computeRevision(content),
    };
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async readContent(path: string): Promise<string> {
    const open = this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === path);
    if (open) {
      return open.editor.getValue();
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${path}`);
    }
    return this.app.vault.read(file);
  }
}
