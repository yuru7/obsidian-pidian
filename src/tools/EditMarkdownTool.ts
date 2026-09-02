import type { NoteEditor, Replacement } from "../domain/notes/NoteEditor";
import type { NoteRepository } from "../domain/notes/NoteRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import {
  NOTE_CHANGED_AFTER_READ,
  ReadRevisionTracker,
} from "../application/ReadRevisionTracker";
import {
  applyReplacementsToText,
  formatReplacementDiff,
  summarizeReplacements,
} from "../application/replacements";
import { assertMarkdownFilePath } from "../application/noteFile";
import { computeRevision } from "../application/revision";

function parseReplacements(value: unknown): Replacement[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("replacements must be a non-empty array.");
  }
  return value.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Each replacement must be an object with oldText and newText.");
    }
    const record = item as { oldText?: unknown; newText?: unknown };
    if (typeof record.oldText !== "string" || typeof record.newText !== "string") {
      throw new Error("Each replacement must include oldText and newText strings.");
    }
    return { oldText: record.oldText, newText: record.newText };
  });
}

export function createEditMarkdownTool(options: {
  sessionId: string;
  notes: NoteRepository;
  editor: NoteEditor;
  permissions: PermissionService;
  tracker: ReadRevisionTracker;
}): PidianTool {
  return {
    name: "edit_markdown",
    label: "Edit markdown",
    description:
      "Edit a Markdown (.md) note using exact unique text replacements. Canvas and other files cannot be edited. Call only when the user explicitly asked to change this vault note. Do not call when they only asked to produce or show text in chat (for example 出して, give me). Do not use to experiment or apply unsolicited rewrites. The note must be the active Markdown editor; if it is not, call open_file (or workspace_tabs) first to open and activate it. The note must also be read first, and revision must match. For an empty note, use oldText as an empty string to insert the initial content.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path of the Markdown (.md) note to edit.",
        },
        revision: {
          type: "string",
          description: "Revision returned by the most recent read_note call.",
        },
        replacements: {
          type: "array",
          description: "Exact unique oldText to newText replacements.",
          items: {
            type: "object",
            properties: {
              oldText: {
                type: "string",
                description:
                  "Exact text to replace. Must be unique. Use an empty string only when the note is empty, to insert the initial content.",
              },
              newText: { type: "string", description: "Replacement text." },
            },
            required: ["oldText", "newText"],
          },
        },
      },
      required: ["path", "revision", "replacements"],
    },
    execute: async (args) => {
      try {
        if (typeof args !== "object" || args === null) {
          return { content: "path, revision, and replacements are required.", isError: true };
        }
        const record = args as {
          path?: unknown;
          revision?: unknown;
          replacements?: unknown;
        };
        if (typeof record.path !== "string" || typeof record.revision !== "string") {
          return { content: "path and revision are required.", isError: true };
        }
        const path = assertMarkdownFilePath(record.path);
        const replacements = parseReplacements(record.replacements);
        const lastRead = options.tracker.requireRead(options.sessionId, path);
        const note = await options.notes.read(path);
        if (note.revision !== lastRead || note.revision !== record.revision) {
          return { content: NOTE_CHANGED_AFTER_READ, isError: true };
        }
        const applied = applyReplacementsToText(note.content, replacements);
        if (!applied.ok) {
          return { content: applied.error, isError: true };
        }
        await options.editor.requireActive(path);

        const summary = summarizeReplacements(replacements);
        const decision = await options.permissions.authorize({
          category: "edit",
          toolName: "edit_markdown",
          summary: `Edit ${path}`,
          details: [
            `File: ${path}`,
            `Replacements: ${summary.replacementCount}`,
            `Added characters: ${summary.addedChars}`,
            `Removed characters: ${summary.removedChars}`,
            "",
            formatReplacementDiff(replacements),
          ].join("\n"),
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }

        const nextContent = await options.editor.applyReplacements(path, replacements);
        const nextRevision = computeRevision(nextContent);
        options.tracker.recordRead(options.sessionId, path, nextRevision);
        return {
          content: JSON.stringify(
            {
              path,
              revision: nextRevision,
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
