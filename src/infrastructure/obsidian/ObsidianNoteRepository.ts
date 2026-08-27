import { MarkdownView, TFile, type App } from "obsidian";
import type { Note, NoteRepository, SearchHit } from "../../domain/notes/NoteRepository";
import { computeRevision } from "../../application/revision";
import { assertSafeNotePath, isExcludedFromSearch } from "../../application/notePath";

const SEARCH_LIMIT = 50;
const SNIPPET_RADIUS = 80;

export class ObsidianNoteRepository implements NoteRepository {
  constructor(private readonly app: App) {}

  async read(path: string): Promise<Note> {
    const normalized = assertSafeNotePath(path);
    const content = await this.readContent(normalized);
    return {
      path: normalized,
      content,
      revision: computeRevision(content),
    };
  }

  async exists(path: string): Promise<boolean> {
    const normalized = assertSafeNotePath(path);
    return this.app.vault.getAbstractFileByPath(normalized) instanceof TFile;
  }

  async create(path: string, content: string): Promise<Note> {
    const normalized = assertSafeNotePath(path);
    const folder = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (folder) {
      await this.ensureFolder(folder);
    }
    await this.app.vault.create(normalized, content);
    return this.read(normalized);
  }

  async search(query: string): Promise<SearchHit[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const hits: SearchHit[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (hits.length >= SEARCH_LIMIT) {
        break;
      }
      if (isExcludedFromSearch(file.path)) {
        continue;
      }
      if (file.basename.toLowerCase().includes(needle) || file.path.toLowerCase().includes(needle)) {
        hits.push({
          path: file.path,
          matchType: "filename",
          snippet: file.path,
        });
        continue;
      }
      const content = await this.app.vault.cachedRead(file);
      const index = content.toLowerCase().indexOf(needle);
      if (index >= 0) {
        hits.push({
          path: file.path,
          matchType: "content",
          snippet: snippetAround(content, index, query.length),
        });
      }
    }
    return hits;
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
