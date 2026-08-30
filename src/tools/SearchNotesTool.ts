import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { agentsFilePath, formatConfigDirExclusion, sessionsDir } from "../application/notePath";

export function createSearchNotesTool(options: {
  notes: NoteRepository;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "search_notes",
    label: "Search notes",
    description:
      `Search Markdown notes in the Obsidian vault by file name and note body. File names are matched exactly first; if none match, a partial match is used (substring, ignoring whitespace differences). Excludes ${formatConfigDirExclusion()}, ${sessionsDir()}/, and ${agentsFilePath()}.`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query matched against file names and note contents.",
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      try {
        const query =
          typeof args === "object" && args !== null && typeof (args as { query?: unknown }).query === "string"
            ? (args as { query: string }).query.trim()
            : "";
        if (!query) {
          return { content: "query is required.", isError: true };
        }
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "search_notes",
          summary: `Search notes for "${query}"`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const hits = await options.notes.search(query);
        return {
          content: JSON.stringify({ query, hits }, null, 2),
        };
      } catch (error) {
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
  };
}
