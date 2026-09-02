import { MarkdownView, TFile, TFolder, type App } from "obsidian";
import type { ListedEntry, Note, NoteRepository, SearchHit } from "../../domain/notes/NoteRepository";
import { computeRevision } from "../../application/revision";
import { selectFilenameHits } from "../../application/filenameSearch";
import { assertNoteFilePath, isNoteExtension } from "../../application/noteFile";
import { assertSafeDirectoryPath, assertSafeNotePath, isExcludedFromSearch, isRestrictedVaultPath } from "../../application/notePath";

const SEARCH_LIMIT = 50;
const SNIPPET_RADIUS = 80;

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

  async search(query: string): Promise<SearchHit[]> {
    const needle = query.trim();
    if (!needle) {
      return [];
    }
    const files = this.app.vault
      .getFiles()
      .filter((file) => isNoteExtension(file.extension) && !isExcludedFromSearch(file.path));
    const filenameHits = selectFilenameHits(
      files.map((file) => file.path),
      needle,
    );
    const hits: SearchHit[] = filenameHits.slice(0, SEARCH_LIMIT).map((path) => ({
      path,
      matchType: "filename" as const,
      snippet: path,
    }));
    if (hits.length >= SEARCH_LIMIT) {
      return hits;
    }

    const filenameHitPaths = new Set(filenameHits);
    const lowerNeedle = needle.toLowerCase();
    for (const file of files) {
      if (hits.length >= SEARCH_LIMIT) {
        break;
      }
      if (filenameHitPaths.has(file.path)) {
        continue;
      }
      const content = await this.app.vault.cachedRead(file);
      const index = content.toLowerCase().indexOf(lowerNeedle);
      if (index >= 0) {
        hits.push({
          path: file.path,
          matchType: "content",
          snippet: snippetAround(content, index, needle.length),
        });
      }
    }
    return hits;
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

function snippetAround(content: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(content.length, index + queryLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end).replace(/\s+/g, " ")}${suffix}`;
}
