import type { NoteMetadataIndex } from "../domain/notes/NoteMetadata";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { assertMarkdownFilePath } from "../application/noteFile";
import { parseNoteMetadataFields } from "../application/noteMetadata";

function parseArgs(args: unknown): { path: string; fields: ReturnType<typeof parseNoteMetadataFields> } {
  if (typeof args !== "object" || args === null) {
    throw new Error("path is required.");
  }
  const record = args as { path?: unknown; fields?: unknown };
  if (typeof record.path !== "string") {
    throw new Error("path is required.");
  }
  return {
    path: assertMarkdownFilePath(record.path),
    fields: parseNoteMetadataFields(record.fields),
  };
}

export function createGetNoteMetadataTool(options: {
  metadata: NoteMetadataIndex;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "get_note_metadata",
    label: "Get note metadata",
    description:
      "Read Markdown note metadata from Obsidian's MetadataCache without reading the note body. Returns frontmatter, tags, aliases, headings, embeds, listItems, sections, outgoing links, and backlinks. Optional fields limits which keys are returned. Line numbers are 1-based to match read_note. Empty collections are []. Unresolved links omit path. Not for Canvas or other non-Markdown files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative Markdown path, for example notes/example.md",
        },
        fields: {
          type: "array",
          description:
            'Optional. Keys to return: frontmatter, tags, aliases, headings, embeds, listItems, sections, links, backlinks. Omit to return all.',
          items: { type: "string" },
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        const { path, fields } = parseArgs(args);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "get_note_metadata",
          summary: `Read metadata for ${path}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const metadata = await options.metadata.getNoteMetadata(path, fields);
        return { content: JSON.stringify(metadata, null, 2) };
      } catch (error) {
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
  };
}
