import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { ReadRevisionTracker } from "../application/ReadRevisionTracker";
import { READ_NOTE_MAX_LINES, sliceNoteContent } from "../application/readRange";
import { assertNoteFilePath } from "../application/noteFile";

function optionalPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseReadNoteArgs(args: unknown): { path: string; offset: number; limit: number } {
  if (typeof args !== "object" || args === null) {
    throw new Error("path is required.");
  }
  const record = args as { path?: unknown; offset?: unknown; limit?: unknown };
  if (typeof record.path !== "string") {
    throw new Error("path is required.");
  }
  return {
    path: assertNoteFilePath(record.path),
    offset: optionalPositiveInt(record.offset, "offset") ?? 1,
    limit: optionalPositiveInt(record.limit, "limit") ?? READ_NOTE_MAX_LINES,
  };
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
    description:
      "Read a Markdown (.md) or Canvas (.canvas) note from the Obsidian vault by line range. offset is the 1-based start line and limit is the number of lines to read. Defaults to offset 1 when the file has no cursor, such as a Canvas. Returns at most 2000 lines or 50KB, whichever is reached first. If truncated is true, call again with nextOffset. Returns path, content, revision, startLine, endLine, totalLines, truncated, and nextOffset.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path to the note, for example notes/example.md or maps/board.canvas",
        },
        offset: {
          type: "number",
          description: "1-based start line. Defaults to 1.",
        },
        limit: {
          type: "number",
          description: "Number of lines to read. Defaults to 2000. Capped at 2000.",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        const { path, offset, limit } = parseReadNoteArgs(args);
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
        const range = sliceNoteContent(note.content, offset, limit);
        return {
          content: JSON.stringify(
            {
              path: note.path,
              content: range.content,
              revision: note.revision,
              startLine: range.startLine,
              endLine: range.endLine,
              totalLines: range.totalLines,
              truncated: range.truncated,
              ...(range.nextOffset === undefined ? {} : { nextOffset: range.nextOffset }),
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
