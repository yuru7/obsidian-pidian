import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { assertSafeDirectoryPath, formatConfigDirExclusion, sessionsDir } from "../application/notePath";

export function createListFilesTool(options: {
  notes: NoteRepository;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "list_files",
    label: "List files",
    description:
      `List immediate files and folders in a vault directory. Not recursive. Use an empty string or / for the vault root. Excludes ${formatConfigDirExclusion()} and ${sessionsDir()}/.`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Vault-relative directory. Use "" or "/" for the vault root.',
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        if (typeof args !== "object" || args === null || typeof (args as { path?: unknown }).path !== "string") {
          return { content: "path is required.", isError: true };
        }
        const directory = assertSafeDirectoryPath((args as { path: string }).path);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "list_files",
          summary: `List ${directory || "/"}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const entries = await options.notes.list(directory);
        return {
          content: JSON.stringify({ path: directory, entries }, null, 2),
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
