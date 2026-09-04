import type { NoteEditor } from "../domain/notes/NoteEditor";
import type { NoteMetadataIndex } from "../domain/notes/NoteMetadata";
import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { NoteSearchIndex } from "../domain/notes/NoteSearchIndex";
import type { ImageRepository } from "../domain/notes/ImageRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import type { WorkspaceNavigator } from "../domain/workspace/WorkspaceNavigator";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { SearchService } from "../application/search/SearchService";
import { FetchService } from "../application/fetch/FetchService";
import { createCreateNoteTool } from "./CreateNoteTool";
import { createDeleteNoteTool } from "./DeleteNoteTool";
import { createEditMarkdownTool } from "./EditMarkdownTool";
import { createFetchUrlTool } from "./FetchUrlTool";
import { createGetNoteMetadataTool } from "./GetNoteMetadataTool";
import { createGetVaultLinksTool } from "./GetVaultLinksTool";
import { createListFilesTool } from "./ListFilesTool";
import { createOpenFileTool } from "./OpenFileTool";
import { createReadImageTool } from "./ReadImageTool";
import { createReadNoteTool } from "./ReadNoteTool";
import { createSearchNotesTool } from "./SearchNotesTool";
import { createWebSearchTool } from "./WebSearchTool";
import { createWorkspaceTabsTool } from "./WorkspaceTabsTool";

export function createPidianTools(options: {
  sessionId: string;
  notes: NoteRepository;
  noteSearch: NoteSearchIndex;
  metadata: NoteMetadataIndex;
  images: ImageRepository;
  editor: NoteEditor;
  workspace: WorkspaceNavigator;
  permissions: PermissionService;
  tracker: ReadRevisionTracker;
  search: SearchService;
  fetchService: FetchService;
}): PidianTool[] {
  return [
    createReadNoteTool(options),
    createReadImageTool(options),
    createSearchNotesTool({ noteSearch: options.noteSearch, permissions: options.permissions }),
    createListFilesTool(options),
    createGetNoteMetadataTool({ metadata: options.metadata, permissions: options.permissions }),
    createGetVaultLinksTool({ metadata: options.metadata, permissions: options.permissions }),
    createOpenFileTool(options),
    createWorkspaceTabsTool(options),
    createWebSearchTool(options),
    createFetchUrlTool(options),
    createCreateNoteTool(options),
    createEditMarkdownTool(options),
    createDeleteNoteTool(options),
  ];
}
