import type { NoteEditor } from "../domain/notes/NoteEditor";
import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import type { WorkspaceNavigator } from "../domain/workspace/WorkspaceNavigator";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { SearchService } from "../application/search/SearchService";
import { FetchService } from "../application/fetch/FetchService";
import { createCreateNoteTool } from "./CreateNoteTool";
import { createDeleteNoteTool } from "./DeleteNoteTool";
import { createEditNoteTool } from "./EditNoteTool";
import { createFetchUrlTool } from "./FetchUrlTool";
import { createListFilesTool } from "./ListFilesTool";
import { createOpenFileTool } from "./OpenFileTool";
import { createReadNoteTool } from "./ReadNoteTool";
import { createSearchNotesTool } from "./SearchNotesTool";
import { createWebSearchTool } from "./WebSearchTool";
import { createWorkspaceTabsTool } from "./WorkspaceTabsTool";

export function createPidianTools(options: {
  sessionId: string;
  notes: NoteRepository;
  editor: NoteEditor;
  workspace: WorkspaceNavigator;
  permissions: PermissionService;
  tracker: ReadRevisionTracker;
  search: SearchService;
  fetchService: FetchService;
}): PidianTool[] {
  return [
    createReadNoteTool(options),
    createSearchNotesTool(options),
    createListFilesTool(options),
    createOpenFileTool(options),
    createWorkspaceTabsTool(options),
    createWebSearchTool(options),
    createFetchUrlTool(options),
    createCreateNoteTool(options),
    createEditNoteTool(options),
    createDeleteNoteTool(options),
  ];
}
