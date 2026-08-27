import { describe, expect, it, vi } from "vitest";
import { PermissionService } from "../application/PermissionService";
import type { OpenFileResult, WorkspaceNavigator, WorkspaceTab } from "../domain/workspace/WorkspaceNavigator";
import { createOpenFileTool } from "./OpenFileTool";
import { createWorkspaceTabsTool } from "./WorkspaceTabsTool";

const allowRead = () =>
  new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny" }),
    { confirm: async () => true },
  );

const denyRead = () =>
  new PermissionService(
    () => ({ read: "deny", create: "deny", edit: "deny", delete: "deny" }),
    { confirm: async () => true },
  );

class MemoryWorkspace implements WorkspaceNavigator {
  readonly opened: string[] = [];
  readonly focused: Array<{ tabId?: string; path?: string }> = [];
  missing = new Set<string>();

  constructor(public tabs: WorkspaceTab[] = []) {}

  async openFile(path: string): Promise<OpenFileResult> {
    if (this.missing.has(path)) {
      throw new Error(`File not found: ${path}`);
    }
    const existing = this.tabs.find((tab) => tab.path === path);
    if (existing) {
      return { path, tab: existing, alreadyOpen: true };
    }
    this.opened.push(path);
    const tab: WorkspaceTab = {
      id: `tab-${path}`,
      title: path,
      viewType: "markdown",
      path,
      active: true,
      pinned: false,
    };
    this.tabs.push(tab);
    return { path, tab, alreadyOpen: false };
  }

  async listTabs(): Promise<WorkspaceTab[]> {
    return this.tabs;
  }

  async focusTab(target: { tabId?: string; path?: string }): Promise<WorkspaceTab> {
    this.focused.push(target);
    const tab = this.tabs.find((item) => item.id === target.tabId || item.path === target.path);
    if (!tab) {
      throw new Error(target.tabId ? `Tab not found: ${target.tabId}` : `No open tab for ${target.path}.`);
    }
    return { ...tab, active: true };
  }
}

describe("open_file", () => {
  it("opens a closed vault file", async () => {
    const workspace = new MemoryWorkspace();
    const tool = createOpenFileTool({ workspace, permissions: allowRead() });
    const result = await tool.execute({ path: "notes/a.md" });
    expect(result.isError).toBeFalsy();
    expect(workspace.opened).toEqual(["notes/a.md"]);
    const payload = JSON.parse(result.content) as OpenFileResult;
    expect(payload.alreadyOpen).toBe(false);
    expect(payload.tab.path).toBe("notes/a.md");
  });

  it("reuses an already open tab instead of opening a duplicate", async () => {
    const workspace = new MemoryWorkspace([
      {
        id: "leaf-1",
        title: "a.md",
        viewType: "markdown",
        path: "notes/a.md",
        active: false,
        pinned: false,
      },
    ]);
    const tool = createOpenFileTool({ workspace, permissions: allowRead() });
    const result = await tool.execute({ path: "notes/a.md" });
    expect(workspace.opened).toEqual([]);
    const payload = JSON.parse(result.content) as OpenFileResult;
    expect(payload.alreadyOpen).toBe(true);
    expect(payload.tab.id).toBe("leaf-1");
  });

  it("refuses when read permission is deny", async () => {
    const workspace = new MemoryWorkspace();
    const tool = createOpenFileTool({ workspace, permissions: denyRead() });
    const result = await tool.execute({ path: "notes/a.md" });
    expect(result.isError).toBe(true);
    expect(workspace.opened).toEqual([]);
  });

  it("rejects unsafe paths before opening", async () => {
    const workspace = new MemoryWorkspace();
    const tool = createOpenFileTool({ workspace, permissions: allowRead() });
    const result = await tool.execute({ path: ".obsidian/app.json" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain(".obsidian");
    expect(workspace.opened).toEqual([]);
  });
});

describe("workspace_tabs", () => {
  it("lists open editor tabs", async () => {
    const workspace = new MemoryWorkspace([
      {
        id: "leaf-1",
        title: "a.md",
        viewType: "markdown",
        path: "a.md",
        active: true,
        pinned: false,
      },
    ]);
    const tool = createWorkspaceTabsTool({ workspace, permissions: allowRead() });
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content) as { tabs: WorkspaceTab[] };
    expect(payload.tabs).toHaveLength(1);
    expect(payload.tabs[0]?.id).toBe("leaf-1");
    expect(workspace.focused).toEqual([]);
  });

  it("focuses a tab by id", async () => {
    const workspace = new MemoryWorkspace([
      {
        id: "leaf-2",
        title: "b.md",
        viewType: "markdown",
        path: "b.md",
        active: false,
        pinned: false,
      },
    ]);
    const tool = createWorkspaceTabsTool({ workspace, permissions: allowRead() });
    const result = await tool.execute({ tabId: "leaf-2" });
    expect(result.isError).toBeFalsy();
    expect(workspace.focused).toEqual([{ tabId: "leaf-2", path: undefined }]);
    const payload = JSON.parse(result.content) as { focused: WorkspaceTab };
    expect(payload.focused.active).toBe(true);
  });

  it("focuses a tab by path", async () => {
    const workspace = new MemoryWorkspace([
      {
        id: "leaf-3",
        title: "c.md",
        viewType: "markdown",
        path: "notes/c.md",
        active: false,
        pinned: false,
      },
    ]);
    const tool = createWorkspaceTabsTool({ workspace, permissions: allowRead() });
    const result = await tool.execute({ path: "notes/c.md" });
    expect(result.isError).toBeFalsy();
    expect(workspace.focused[0]?.path).toBe("notes/c.md");
  });

  it("asks when read permission is ask", async () => {
    const confirm = vi.fn(async () => true);
    const workspace = new MemoryWorkspace();
    const tool = createWorkspaceTabsTool({
      workspace,
      permissions: new PermissionService(
        () => ({ read: "ask", create: "deny", edit: "deny", delete: "deny" }),
        { confirm },
      ),
    });
    await tool.execute({});
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("refuses when read permission is deny", async () => {
    const workspace = new MemoryWorkspace([
      {
        id: "leaf-1",
        title: "a.md",
        viewType: "markdown",
        path: "a.md",
        active: true,
        pinned: false,
      },
    ]);
    const tool = createWorkspaceTabsTool({ workspace, permissions: denyRead() });
    const result = await tool.execute({ tabId: "leaf-1" });
    expect(result.isError).toBe(true);
    expect(workspace.focused).toEqual([]);
  });
});
