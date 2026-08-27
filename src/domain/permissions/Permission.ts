export type Permission = "allow" | "ask" | "deny";

export type ToolCategory = "read" | "edit" | "create" | "delete";

export interface PermissionSettings {
  read: Permission;
  edit: Permission;
  create: Permission;
  delete: Permission;
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
