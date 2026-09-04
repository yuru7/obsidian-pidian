import { TFile, TFolder, type App, type EventRef, type TAbstractFile } from "obsidian";
import { isNoteExtension } from "../../application/noteFile";
import { isExcludedFromSearch } from "../../application/notePath";
import type { SearchIndexHost, SearchIndexNoteMeta, SearchIndexService } from "./SearchIndexService";

export function createObsidianSearchIndexHost(app: App): SearchIndexHost {
  return {
    listNotes() {
      return app.vault.getFiles().flatMap((file) => {
        const meta = toNoteMeta(file);
        return meta ? [meta] : [];
      });
    },
    noteMeta(path: string) {
      const file = app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? toNoteMeta(file) : undefined;
    },
    async readNote(path: string) {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !isSearchableFile(file)) {
        return undefined;
      }
      try {
        return await app.vault.cachedRead(file);
      } catch (error) {
        console.warn(`Pidian: failed to read ${path} for search index`, error);
        return undefined;
      }
    },
  };
}

export function bindVaultSearchIndexEvents(
  vault: {
    on(name: "create" | "modify" | "delete", callback: (file: TAbstractFile) => void): EventRef;
    on(name: "rename", callback: (file: TAbstractFile, oldPath: string) => void): EventRef;
  },
  registerEvent: (ref: EventRef) => void,
  service: SearchIndexService,
): void {
  registerEvent(
    vault.on("create", (file) => {
      if (isSearchableFile(file)) {
        service.scheduleUpsert(file.path);
      }
    }),
  );
  registerEvent(
    vault.on("modify", (file) => {
      if (isSearchableFile(file)) {
        service.scheduleUpsert(file.path);
      }
    }),
  );
  registerEvent(
    vault.on("delete", (file) => {
      void service.removeTree(file.path);
    }),
  );
  registerEvent(
    vault.on("rename", (file, oldPath) => {
      if (file instanceof TFolder) {
        void service.resync();
        return;
      }
      if (file instanceof TFile) {
        void service.rename(oldPath, file.path);
      } else {
        void service.removeTree(oldPath);
      }
    }),
  );
}

function toNoteMeta(file: TFile): SearchIndexNoteMeta | undefined {
  if (!isSearchableFile(file)) {
    return undefined;
  }
  return {
    path: file.path,
    title: file.basename,
    mtime: file.stat.mtime,
    size: file.stat.size,
  };
}

function isSearchableFile(file: TAbstractFile): file is TFile {
  return file instanceof TFile && isNoteExtension(file.extension) && !isExcludedFromSearch(file.path);
}
