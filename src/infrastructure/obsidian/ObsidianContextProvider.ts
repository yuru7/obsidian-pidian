import { FileView, MarkdownView, TFile, type App, type Editor, type MarkdownFileInfo, type WorkspaceLeaf } from "obsidian";
import type { ContextSnapshot } from "../../domain/notes/ContextSnapshot";
import type { ContextProvider } from "../../application/ContextService";
import { isRestrictedVaultPath } from "../../application/notePath";
import { isNoteFilePath } from "../../application/noteFile";
import {
  pickMarkdownSource,
  snapshotFromEditorSource,
  type MarkdownEditorSource,
} from "../../application/activeMarkdown";

export class ObsidianContextProvider implements ContextProvider {
  private lastMarkdownView: MarkdownView | undefined;
  private lastNonMarkdownPath: string | undefined;

  constructor(private readonly app: App) {
    this.rememberCurrentFile();
  }

  rememberCurrentFile(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && !isMarkdownFile(activeFile) && this.snapshotForNonMarkdown(activeFile.path)) {
      return;
    }
    const recentFile = this.fileFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit));
    if (recentFile && !isMarkdownFile(recentFile) && this.snapshotForNonMarkdown(recentFile.path)) {
      return;
    }
    const view =
      this.app.workspace.getActiveViewOfType(MarkdownView) ??
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)) ??
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf());
    if (view?.file) {
      this.lastMarkdownView = view;
      this.lastNonMarkdownPath = undefined;
    }
  }

  getActiveNote(): ContextSnapshot | undefined {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && isMarkdownFile(activeFile)) {
      const source = pickMarkdownSource([
        this.fromView(this.app.workspace.getActiveViewOfType(MarkdownView)),
        this.fromEditorInfo(this.app.workspace.activeEditor),
        this.fromView(this.findMarkdownViewForFile(activeFile)),
      ]);
      if (source) {
        this.rememberMarkdown(source.notePath);
        return snapshotFromEditorSource(source);
      }
    }
    if (activeFile && !isMarkdownFile(activeFile)) {
      const snapshot = this.snapshotForNonMarkdown(activeFile.path);
      if (snapshot) {
        return snapshot;
      }
    }

    const recentRoot = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const recent = this.app.workspace.getMostRecentLeaf();
    const recentRootFile = this.fileFromLeaf(recentRoot);
    if (recentRootFile && !isMarkdownFile(recentRootFile)) {
      const snapshot = this.snapshotForNonMarkdown(recentRootFile.path);
      if (snapshot) {
        return snapshot;
      }
    }
    const recentFile = this.fileFromLeaf(recent);
    if (recentFile && !isMarkdownFile(recentFile)) {
      const snapshot = this.snapshotForNonMarkdown(recentFile.path);
      if (snapshot) {
        return snapshot;
      }
    }

    const source = pickMarkdownSource([
      this.fromView(markdownViewFromLeaf(recentRoot)),
      this.fromView(markdownViewFromLeaf(recent)),
      this.fromEditorInfo(this.app.workspace.activeEditor),
      this.fromView(this.validLastMarkdownView()),
    ]);
    if (source) {
      this.rememberMarkdown(source.notePath);
      return snapshotFromEditorSource(source);
    }
    if (this.lastNonMarkdownPath) {
      return this.snapshotForNonMarkdown(this.lastNonMarkdownPath);
    }
    return undefined;
  }

  private snapshotForNonMarkdown(path: string): ContextSnapshot | undefined {
    if (isRestrictedVaultPath(path) || !isNoteFilePath(path)) {
      return undefined;
    }
    this.lastNonMarkdownPath = path;
    return { notePath: path };
  }

  private rememberMarkdown(notePath: string): void {
    const remembered = [
      this.app.workspace.getActiveViewOfType(MarkdownView),
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)),
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf()),
      this.findMarkdownViewForFile(this.app.workspace.getActiveFile()),
      this.validLastMarkdownView(),
    ].find((view) => view?.file?.path === notePath);
    if (remembered?.file) {
      this.lastMarkdownView = remembered;
    }
    this.lastNonMarkdownPath = undefined;
  }

  private fromView(view: MarkdownView | null | undefined): MarkdownEditorSource | undefined {
    if (!view?.file) {
      return undefined;
    }
    return fromEditor(view.file, view.editor);
  }

  private fromEditorInfo(info: MarkdownFileInfo | null): MarkdownEditorSource | undefined {
    if (!info?.file || !info.editor || !isMarkdownFile(info.file)) {
      return undefined;
    }
    return fromEditor(info.file, info.editor);
  }

  private findMarkdownViewForFile(file: TFile | null): MarkdownView | undefined {
    if (!file || !isMarkdownFile(file)) {
      return undefined;
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = markdownViewFromLeaf(leaf);
      if (view?.file?.path === file.path) {
        return view;
      }
    }
    return undefined;
  }

  private validLastMarkdownView(): MarkdownView | undefined {
    const view = this.lastMarkdownView;
    if (!view?.file || !view.containerEl.isConnected || view.leaf.view !== view) {
      this.lastMarkdownView = undefined;
      return undefined;
    }
    return view;
  }

  private fileFromLeaf(leaf: WorkspaceLeaf | null | undefined): TFile | undefined {
    const view = leaf?.view;
    if (view instanceof FileView && view.file) {
      return view.file;
    }
    const path = leaf?.getViewState()?.state?.file;
    if (typeof path !== "string" || path.length === 0) {
      return undefined;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : undefined;
  }
}

function fromEditor(file: TFile, editor: Editor): MarkdownEditorSource {
  return {
    notePath: file.path,
    fromLine: editor.getCursor("from").line,
    toLine: editor.getCursor("to").line,
  };
}

function markdownViewFromLeaf(leaf: WorkspaceLeaf | null | undefined): MarkdownView | undefined {
  const view = leaf?.view;
  if (view instanceof MarkdownView && view.file) {
    return view;
  }
  return undefined;
}

function isMarkdownFile(file: TFile): boolean {
  return file.extension === "md";
}
