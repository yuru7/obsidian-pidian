import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { assertSafeNotePath } from "../application/notePath";

function asPath(args: unknown): string {
  if (typeof args !== "object" || args === null || typeof (args as { path?: unknown }).path !== "string") {
    throw new Error("path is required.");
  }
  return assertSafeNotePath((args as { path: string }).path);
}

export function createReadNoteTool(options: {
  sessionId: string;
  notes: NoteRepository;
  permissions: PermissionService;
  tracker: ReadRevisionTracker;
}): PidianTool {
  return {
    name: "read_note",
    label: "Read note",
    description: "Read a Markdown note from the Obsidian vault. Returns path, content, and revision.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path to the note, for example notes/example.md",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        const path = asPath(args);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "read_note",
          summary: `Read ${path}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const note = await options.notes.read(path);
        options.tracker.recordRead(options.sessionId, note.path, note.revision);
        return {
          content: JSON.stringify(
            {
              path: note.path,
              content: note.content,
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
