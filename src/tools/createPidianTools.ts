import type { NoteEditor } from "../domain/notes/NoteEditor";
import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import type { WorkspaceNavigator } from "../domain/workspace/WorkspaceNavigator";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { createCreateNoteTool } from "./CreateNoteTool";
import { createDeleteNoteTool } from "./DeleteNoteTool";
import { createEditNoteTool } from "./EditNoteTool";
import { createListFilesTool } from "./ListFilesTool";
import { createOpenFileTool } from "./OpenFileTool";
import { createReadNoteTool } from "./ReadNoteTool";
import { createSearchNotesTool } from "./SearchNotesTool";
import { createWorkspaceTabsTool } from "./WorkspaceTabsTool";

export function createPidianTools(options: {
  sessionId: string;
  notes: NoteRepository;
  editor: NoteEditor;
  workspace: WorkspaceNavigator;
  permissions: PermissionService;
  tracker: ReadRevisionTracker;
}): PidianTool[] {
  return [
    createReadNoteTool(options),
    createSearchNotesTool(options),
    createListFilesTool(options),
    createOpenFileTool(options),
    createWorkspaceTabsTool(options),
    createCreateNoteTool(options),
    createEditNoteTool(options),
    createDeleteNoteTool(options),
  ];
}
