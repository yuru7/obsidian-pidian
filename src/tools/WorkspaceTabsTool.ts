import type { PidianTool } from "../domain/tools/PidianTool";
import type { WorkspaceNavigator } from "../domain/workspace/WorkspaceNavigator";
import { PermissionService } from "../application/PermissionService";
import { assertSafeNotePath } from "../application/notePath";

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createWorkspaceTabsTool(options: {
  workspace: WorkspaceNavigator;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "workspace_tabs",
    label: "Workspace tabs",
    description:
      "List open editor tabs, or focus an existing tab. Call with no arguments to list tabs. Pass tabId or path to switch to that tab and make it the active editor. Does not open files that are not already in a tab; use open_file for that.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "string",
          description: "Id of an open tab from a previous workspace_tabs listing. Focuses that tab.",
        },
        path: {
          type: "string",
          description: "Vault-relative path of a file that is already open in a tab. Focuses that tab.",
        },
      },
    },
    execute: async (args) => {
      try {
        const record = typeof args === "object" && args !== null ? (args as { tabId?: unknown; path?: unknown }) : {};
        const tabId = asOptionalString(record.tabId);
        const rawPath = asOptionalString(record.path);
        const path = rawPath ? assertSafeNotePath(rawPath) : undefined;
        const focusing = Boolean(tabId || path);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "workspace_tabs",
          summary: focusing ? `Focus tab ${tabId ?? path}` : "List workspace tabs",
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        if (focusing) {
          const tab = await options.workspace.focusTab({ tabId, path });
          return { content: JSON.stringify({ focused: tab }, null, 2) };
        }
        const tabs = await options.workspace.listTabs();
        return { content: JSON.stringify({ tabs }, null, 2) };
      } catch (error) {
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
  };
}
