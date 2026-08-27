import { FileView, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { assertSafeNotePath, normalizeNotePath } from "../../application/notePath";
import type {
  OpenFileResult,
  WorkspaceNavigator,
  WorkspaceTab,
} from "../../domain/workspace/WorkspaceNavigator";

export class ObsidianWorkspaceNavigator implements WorkspaceNavigator {
  constructor(private readonly app: App) {}

  async openFile(path: string): Promise<OpenFileResult> {
    const normalized = assertSafeNotePath(path);
    const existing = this.findLeafByPath(normalized);
    if (existing) {
      await this.activate(existing);
      return { path: normalized, tab: this.describe(existing), alreadyOpen: true };
    }

    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${normalized}`);
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: false });
    return { path: normalized, tab: this.describe(leaf), alreadyOpen: false };
  }

  async listTabs(): Promise<WorkspaceTab[]> {
    return this.rootLeaves().map((leaf) => this.describe(leaf));
  }

  async focusTab(target: { tabId?: string; path?: string }): Promise<WorkspaceTab> {
    const tabId = target.tabId?.trim();
    const path = target.path?.trim();
    if (!tabId && !path) {
      throw new Error("tabId or path is required to focus a tab.");
    }

    const leaf = tabId ? this.findLeafById(tabId) : this.findLeafByPath(assertSafeNotePath(path ?? ""));
    if (!leaf) {
      throw new Error(tabId ? `Tab not found: ${tabId}` : `No open tab for ${path}.`);
    }
    await this.activate(leaf);
    return this.describe(leaf);
  }

  private async activate(leaf: WorkspaceLeaf): Promise<void> {
    if (leaf.isDeferred) {
      await leaf.loadIfDeferred();
    }
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: false });
  }

  private rootLeaves(): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateRootLeaves((leaf) => {
      leaves.push(leaf);
    });
    return leaves;
  }

  private findLeafById(id: string): WorkspaceLeaf | undefined {
    return this.app.workspace.getLeafById(id) ?? undefined;
  }

  private findLeafByPath(path: string): WorkspaceLeaf | undefined {
    const normalized = normalizeNotePath(path);
    return this.rootLeaves().find((leaf) => filePathFromLeaf(leaf) === normalized);
  }

  private describe(leaf: WorkspaceLeaf): WorkspaceTab {
    const state = leaf.getViewState();
    const path = filePathFromLeaf(leaf);
    const tab: WorkspaceTab = {
      id: leafId(leaf),
      title: leaf.getDisplayText(),
      viewType: state.type,
      active: this.isActiveEditorTab(leaf),
      pinned: Boolean(state.pinned),
    };
    if (path) {
      tab.path = path;
    }
    return tab;
  }

  private isActiveEditorTab(leaf: WorkspaceLeaf): boolean {
    return this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit) === leaf;
  }
}

function filePathFromLeaf(leaf: WorkspaceLeaf): string | undefined {
  const stateFile = leaf.getViewState().state?.file;
  if (typeof stateFile === "string" && stateFile.length > 0) {
    return normalizeNotePath(stateFile);
  }
  const view = leaf.view;
  if (view instanceof FileView && view.file) {
    return view.file.path;
  }
  return undefined;
}

function leafId(leaf: WorkspaceLeaf): string {
  // WorkspaceLeaf.id is omitted from public typings, but getLeafById is a public API.
  const id = (leaf as WorkspaceLeaf & { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Workspace leaf is missing an id.");
  }
  return id;
}
