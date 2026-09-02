import { FileView, MarkdownView, TFile, type App, type Editor, type MarkdownFileInfo, type WorkspaceLeaf } from "obsidian";
import type { ContextSnapshot } from "../../domain/notes/ContextSnapshot";
import type { ContextProvider } from "../../application/ContextService";
import { isRestrictedVaultPath } from "../../application/notePath";
import { isContextFilePath } from "../../application/noteFile";
import {
  pickMarkdownSourceForPath,
  snapshotFromEditorSource,
  type MarkdownEditorSource,
} from "../../application/activeMarkdown";
import { resolveContextTarget, type ContextTarget } from "../../application/contextTarget";

export class ObsidianContextProvider implements ContextProvider {
  private lastMarkdownView: MarkdownView | undefined;
  private lastPathOnly: string | undefined;

  constructor(private readonly app: App) {
    this.rememberCurrentFile();
  }

  rememberCurrentFile(): void {
    const recentRoot = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const recent = this.app.workspace.getMostRecentLeaf();
    const visibleFile = this.fileFromLeaf(recentRoot) ?? this.fileFromLeaf(recent);
    const visibleMarkdown =
      markdownViewFromLeaf(recentRoot) ?? markdownViewFromLeaf(recent);
    if (visibleFile && visibleMarkdown?.file?.path === visibleFile.path) {
      this.lastMarkdownView = visibleMarkdown;
      this.lastPathOnly = undefined;
      return;
    }
    if (visibleFile) {
      this.snapshotForVisiblePath(visibleFile.path);
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && !isMarkdownFile(activeFile)) {
      this.snapshotForVisiblePath(activeFile.path);
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file) {
      this.lastMarkdownView = view;
      this.lastPathOnly = undefined;
      return;
    }
    this.validLastPathOnly();
  }

  getActiveNote(): ContextSnapshot | undefined {
    const recentRoot = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const recent = this.app.workspace.getMostRecentLeaf();
    const visibleFile = this.fileFromLeaf(recentRoot) ?? this.fileFromLeaf(recent);
    const visibleMarkdownView =
      markdownViewFromLeaf(recentRoot) ?? markdownViewFromLeaf(recent);
    const visibleMarkdown =
      visibleFile && visibleMarkdownView?.file?.path === visibleFile.path
        ? this.fromView(visibleMarkdownView)
        : undefined;

    const activeFile = this.app.workspace.getActiveFile();
    const activeMarkdown = activeFile
      ? pickMarkdownSourceForPath(activeFile.path, [
          this.fromView(this.app.workspace.getActiveViewOfType(MarkdownView)),
          this.fromEditorInfo(this.app.workspace.activeEditor),
          this.fromView(this.findMarkdownViewForFile(activeFile)),
        ])
      : undefined;

    return this.snapshotFromTarget(
      resolveContextTarget({
        visibleFile: visibleFile
          ? { path: visibleFile.path, markdownExtension: isMarkdownFile(visibleFile) }
          : undefined,
        visibleMarkdown,
        activeFile: activeFile
          ? { path: activeFile.path, markdownExtension: isMarkdownFile(activeFile) }
          : undefined,
        activeMarkdown,
        lastMarkdown: this.fromView(this.validLastMarkdownView()),
        lastPathOnly: this.validLastPathOnly(),
      }),
    );
  }

  private snapshotFromTarget(target: ContextTarget | undefined): ContextSnapshot | undefined {
    if (!target) {
      return undefined;
    }
    if (target.kind === "markdown") {
      this.rememberMarkdown(target.source.notePath);
      return snapshotFromEditorSource(target.source);
    }
    return this.snapshotForVisiblePath(target.notePath);
  }

  private snapshotForPath(path: string): ContextSnapshot | undefined {
    if (isRestrictedVaultPath(path) || !isContextFilePath(path)) {
      return undefined;
    }
    this.lastPathOnly = path;
    this.lastMarkdownView = undefined;
    return { notePath: path };
  }

  /**
   * Path-only snapshot for the visible tab (Canvas, image, or a .md custom view such as
   * Excalidraw). If the file is not a context file, clear memory and do not fall back to
   * another tab. `workspace.activeEditor` stays on the last Markdown editor, so a custom
   * view of a `.md` file must not reuse that editor.
   */
  private snapshotForVisiblePath(path: string): ContextSnapshot | undefined {
    const snapshot = this.snapshotForPath(path);
    if (snapshot) {
      return snapshot;
    }
    this.lastMarkdownView = undefined;
    this.lastPathOnly = undefined;
    return undefined;
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
    this.lastPathOnly = undefined;
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

  /** Drop a remembered path-only file when no editor tab still shows it (e.g. the same tab opened a GIF). */
  private validLastPathOnly(): string | undefined {
    const path = this.lastPathOnly;
    if (!path || !this.isOpenInRoot(path)) {
      this.lastPathOnly = undefined;
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
