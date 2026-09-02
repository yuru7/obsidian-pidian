import { FileView, MarkdownView, TFile, type App, type Editor, type MarkdownFileInfo, type WorkspaceLeaf } from "obsidian";
import type { ContextSnapshot } from "../../domain/notes/ContextSnapshot";
import type { ContextProvider } from "../../application/ContextService";
import { isRestrictedVaultPath } from "../../application/notePath";
import { isContextFilePath } from "../../application/noteFile";
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
    if (activeFile && this.rememberIfNonMarkdown(activeFile)) {
      return;
    }
    const recentFile = this.fileFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit));
    if (recentFile && this.rememberIfNonMarkdown(recentFile)) {
      return;
    }
    const view =
      this.app.workspace.getActiveViewOfType(MarkdownView) ??
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)) ??
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf());
    if (view?.file) {
      this.lastMarkdownView = view;
      this.lastNonMarkdownPath = undefined;
      return;
    }
    this.validLastNonMarkdownPath();
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
      return this.snapshotForVisibleNonMarkdown(activeFile);
    }

    const recentRoot = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const recent = this.app.workspace.getMostRecentLeaf();
    const recentRootFile = this.fileFromLeaf(recentRoot);
    if (recentRootFile && !isMarkdownFile(recentRootFile)) {
      return this.snapshotForVisibleNonMarkdown(recentRootFile);
    }
    const recentFile = this.fileFromLeaf(recent);
    if (recentFile && !isMarkdownFile(recentFile)) {
      return this.snapshotForVisibleNonMarkdown(recentFile);
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
    const lastPath = this.validLastNonMarkdownPath();
    if (lastPath) {
      return this.snapshotForNonMarkdown(lastPath);
    }
    return undefined;
  }

  private snapshotForNonMarkdown(path: string): ContextSnapshot | undefined {
    if (isRestrictedVaultPath(path) || !isContextFilePath(path)) {
      return undefined;
    }
    this.lastNonMarkdownPath = path;
    return { notePath: path };
  }

  /** Visible non-markdown file: canvas or PNG/JPEG/WebP snapshot, or undefined without falling back to another tab. */
  private snapshotForVisibleNonMarkdown(file: TFile): ContextSnapshot | undefined {
    const snapshot = this.snapshotForNonMarkdown(file.path);
    if (snapshot) {
      return snapshot;
    }
    this.lastMarkdownView = undefined;
    this.lastNonMarkdownPath = undefined;
    return undefined;
  }

  private rememberIfNonMarkdown(file: TFile): boolean {
    if (isMarkdownFile(file)) {
      return false;
    }
    this.snapshotForVisibleNonMarkdown(file);
    return true;
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

  /** Drop a remembered canvas or image when no editor tab still shows that file (e.g. the same tab opened a GIF). */
  private validLastNonMarkdownPath(): string | undefined {
    const path = this.lastNonMarkdownPath;
    if (!path || !this.isOpenInRoot(path)) {
      this.lastNonMarkdownPath = undefined;
      return undefined;
    }
    return path;
  }

  private isOpenInRoot(path: string): boolean {
    let open = false;
    this.app.workspace.iterateRootLeaves((leaf) => {
      if (!open && this.fileFromLeaf(leaf)?.path === path) {
        open = true;
      }
    });
    return open;
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
