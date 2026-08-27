import type { NoteEditor } from "../domain/notes/NoteEditor";
import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { createCreateNoteTool } from "./CreateNoteTool";
import { createEditNoteTool } from "./EditNoteTool";
import { createReadNoteTool } from "./ReadNoteTool";
import { createSearchNotesTool } from "./SearchNotesTool";

export function createPidianTools(options: {
  sessionId: string;
  notes: NoteRepository;
  editor: NoteEditor;
  permissions: PermissionService;
  tracker: ReadRevisionTracker;
}): PidianTool[] {
  return [
    createReadNoteTool(options),
    createSearchNotesTool(options),
    createCreateNoteTool(options),
    createEditNoteTool(options),
  ];
}
