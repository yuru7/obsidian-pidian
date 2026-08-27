export type Permission = "allow" | "ask" | "deny";

export type ToolCategory = "read" | "search" | "create" | "edit";

export interface PermissionSettings {
  read: Permission;
  search: Permission;
  create: Permission;
  edit: Permission;
}

export interface PermissionRequest {
  category: ToolCategory;
  toolName: string;
  summary: string;
  details?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
}

export interface PermissionPrompter {
  confirm(request: PermissionRequest): Promise<boolean>;
}
