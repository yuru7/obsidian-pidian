import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { assertSafeNotePath } from "../application/notePath";

export function createCreateNoteTool(options: {
  notes: NoteRepository;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "create_note",
    label: "Create note",
    description: "Create a new Markdown note in the Obsidian vault. Fails if the path already exists.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path for the new note.",
        },
        content: {
          type: "string",
          description: "Initial Markdown content. Optional.",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        if (typeof args !== "object" || args === null) {
          return { content: "path is required.", isError: true };
        }
        const record = args as { path?: unknown; content?: unknown };
        if (typeof record.path !== "string") {
          return { content: "path is required.", isError: true };
        }
        const path = assertSafeNotePath(record.path);
        const content = typeof record.content === "string" ? record.content : "";
        const decision = await options.permissions.authorize({
          category: "create",
          toolName: "create_note",
          summary: `Create ${path}`,
          details: content ? `Initial length: ${content.length} characters` : "Empty note",
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        if (await options.notes.exists(path)) {
          return { content: `A note already exists at ${path}.`, isError: true };
        }
        const note = await options.notes.create(path, content);
        return {
          content: JSON.stringify(
            {
              path: note.path,
              revision: note.revision,
            },
            null,
            2,
          ),
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
