import { MarkdownView, TFile, type App, type Editor, type MarkdownFileInfo, type WorkspaceLeaf } from "obsidian";
import type { ContextSnapshot } from "../../domain/notes/ContextSnapshot";
import type { ContextProvider } from "../../application/ContextService";
import {
  pickMarkdownSource,
  snapshotFromEditorSource,
  type MarkdownEditorSource,
} from "../../application/activeMarkdown";

export class ObsidianContextProvider implements ContextProvider {
  private lastMarkdownView: MarkdownView | undefined;

  constructor(private readonly app: App) {
    this.rememberCurrentMarkdown();
  }

  rememberCurrentMarkdown(): void {
    const view =
      this.app.workspace.getActiveViewOfType(MarkdownView) ??
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)) ??
      markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf());
    if (view?.file) {
      this.lastMarkdownView = view;
    }
  }

  getActiveNote(): ContextSnapshot | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const recentRoot = markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit));
    const recent = markdownViewFromLeaf(this.app.workspace.getMostRecentLeaf());
    const byFile = this.findMarkdownViewForFile(this.app.workspace.getActiveFile());
    const last = this.validLastMarkdownView();
    const source = pickMarkdownSource([
      this.fromView(activeView),
      this.fromEditorInfo(this.app.workspace.activeEditor),
      this.fromView(recentRoot),
      this.fromView(recent),
      this.fromView(byFile),
      this.fromView(last),
    ]);
    if (!source) {
      return undefined;
    }
    const remembered = [activeView, recentRoot, recent, byFile, last].find(
      (view) => view?.file?.path === source.notePath,
    );
    if (remembered?.file) {
      this.lastMarkdownView = remembered;
    }
    return snapshotFromEditorSource(source);
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
