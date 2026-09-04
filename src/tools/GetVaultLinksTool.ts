import type { NoteMetadataIndex } from "../domain/notes/NoteMetadata";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { assertSafeDirectoryPath } from "../application/notePath";
import { parseVaultLinkFields, parseVaultLinksLimit } from "../application/noteMetadata";

function parseArgs(args: unknown): { path?: string; fields: ReturnType<typeof parseVaultLinkFields>; limit: number } {
  const record = typeof args === "object" && args !== null ? (args as { path?: unknown; fields?: unknown; limit?: unknown }) : {};
  const rawPath = typeof record.path === "string" ? record.path : undefined;
  return {
    path: rawPath === undefined ? undefined : assertSafeDirectoryPath(rawPath),
    fields: parseVaultLinkFields(record.fields),
    limit: parseVaultLinksLimit(record.limit),
  };
}

export function createGetVaultLinksTool(options: {
  metadata: NoteMetadataIndex;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "get_vault_links",
    label: "Get vault links",
    description:
      "Read vault-wide resolved and unresolved link maps from Obsidian's MetadataCache. resolvedLinks maps source notes to destination paths with counts. unresolvedLinks maps source notes to unknown link text with counts. Optional path limits sources to that file or files under that folder prefix. Optional fields selects resolvedLinks and/or unresolvedLinks. Optional limit caps how many source files are returned (default 200, max 2000). truncated is true when more sources remain.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'Optional. Vault-relative source file or folder prefix. Use "" or "/" for the whole vault. Matches that path and files under it.',
        },
        fields: {
          type: "array",
          description: "Optional. Keys to return: resolvedLinks, unresolvedLinks. Omit to return both.",
          items: { type: "string" },
        },
        limit: {
          type: "number",
          description: "Maximum source files to return. Defaults to 200. Capped at 2000.",
        },
      },
    },
    execute: async (args) => {
      try {
        const { path, fields, limit } = parseArgs(args);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "get_vault_links",
          summary: path ? `Read vault links under ${path}` : "Read vault links",
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const links = await options.metadata.getVaultLinks({ fields, path, limit });
        return { content: JSON.stringify(links, null, 2) };
      } catch (error) {
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
  };
}
