import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { assertSafeNotePath } from "../application/notePath";

export function createDeleteNoteTool(options: {
  notes: NoteRepository;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "delete_note",
    label: "Delete note",
    description:
      "Delete a Markdown note from the Obsidian vault. The file is moved to trash according to the user's Obsidian trash setting.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path of the note to delete.",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        if (typeof args !== "object" || args === null) {
          return { content: "path is required.", isError: true };
        }
        const record = args as { path?: unknown };
        if (typeof record.path !== "string") {
          return { content: "path is required.", isError: true };
        }
        const path = assertSafeNotePath(record.path);
        const decision = await options.permissions.authorize({
          category: "delete",
          toolName: "delete_note",
          summary: `Delete ${path}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        if (!(await options.notes.exists(path))) {
          return { content: `Note not found: ${path}`, isError: true };
        }
        await options.notes.delete(path);
        return {
          content: JSON.stringify({ path, deleted: true }, null, 2),
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
