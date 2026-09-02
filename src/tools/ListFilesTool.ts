import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { matchesNameGlob, parseOptionalNameGlob } from "../application/nameGlob";
import { PermissionService } from "../application/PermissionService";
import { assertSafeDirectoryPath, formatConfigDirExclusion, sessionsDir } from "../application/notePath";

function parseListFilesArgs(args: unknown): { directory: string; glob?: string } {
  if (typeof args !== "object" || args === null || typeof (args as { path?: unknown }).path !== "string") {
    throw new Error("path is required.");
  }
  const record = args as { path: string; glob?: unknown };
  return {
    directory: assertSafeDirectoryPath(record.path),
    glob: parseOptionalNameGlob(record.glob),
  };
}

export function createListFilesTool(options: {
  notes: NoteRepository;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "list_files",
    label: "List files",
    description:
      `List immediate files and folders in a vault directory. Not recursive. Use an empty string or / for the vault root. Optional glob filters by entry name in this directory only (* is the only wildcard, for example *.json). ** and path separators are rejected. Excludes ${formatConfigDirExclusion()} and ${sessionsDir()}/.`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Vault-relative directory. Use "" or "/" for the vault root.',
        },
        glob: {
          type: "string",
          description:
            "Optional. Filter immediate entries by name. * is the only wildcard (for example *.json). Not recursive; ** and path separators are rejected.",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        const { directory, glob } = parseListFilesArgs(args);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "list_files",
          summary: glob ? `List ${directory || "/"} (${glob})` : `List ${directory || "/"}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const listed = await options.notes.list(directory);
        const entries = glob ? listed.filter((entry) => matchesNameGlob(entry.name, glob)) : listed;
        return {
          content: JSON.stringify(glob ? { path: directory, glob, entries } : { path: directory, entries }, null, 2),
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
