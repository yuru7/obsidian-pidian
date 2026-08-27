import type { PidianTool } from "../domain/tools/PidianTool";
import type { WorkspaceNavigator } from "../domain/workspace/WorkspaceNavigator";
import { PermissionService } from "../application/PermissionService";
import { assertSafeNotePath } from "../application/notePath";

function asPath(args: unknown): string {
  if (typeof args !== "object" || args === null || typeof (args as { path?: unknown }).path !== "string") {
    throw new Error("path is required.");
  }
  return assertSafeNotePath((args as { path: string }).path);
}

export function createOpenFileTool(options: {
  workspace: WorkspaceNavigator;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "open_file",
    label: "Open file",
    description:
      "Open a vault file that is not currently in a tab. If it is already open, reports the existing tab instead of creating a duplicate. Use workspace_tabs to switch between open tabs.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path to open, for example notes/example.md",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        const path = asPath(args);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "open_file",
          summary: `Open ${path}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const result = await options.workspace.openFile(path);
        return {
          content: JSON.stringify(result, null, 2),
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
