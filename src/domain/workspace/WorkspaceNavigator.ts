export interface WorkspaceTab {
  id: string;
  title: string;
  viewType: string;
  path?: string;
  active: boolean;
  pinned: boolean;
}

export interface OpenFileResult {
  path: string;
  tab: WorkspaceTab;
  alreadyOpen: boolean;
}

export interface WorkspaceNavigator {
  openFile(path: string): Promise<OpenFileResult>;
  listTabs(): Promise<WorkspaceTab[]>;
  focusTab(target: { tabId?: string; path?: string }): Promise<WorkspaceTab>;
}
