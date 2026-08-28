import type { PermissionSettings } from "../domain/permissions/Permission";

export interface CustomOpenAIProvider {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
}

export interface PidianSettings {
  provider: string;
  model: string;
  apiKeys: Record<string, string>;
  customProviders: CustomOpenAIProvider[];
  permissions: PermissionSettings;
  autoDeleteSessions: boolean;
  retentionDays: number;
}

export const DEFAULT_SETTINGS: PidianSettings = {
  provider: "openai",
  model: "gpt-5",
  apiKeys: {},
  customProviders: [],
  permissions: {
    read: "allow",
    edit: "deny",
    create: "deny",
    delete: "deny",
  },
  autoDeleteSessions: false,
  retentionDays: 30,
};

export function mergeSettings(raw: unknown): PidianSettings {
  const rawObject = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  delete rawObject.maxEditableNotes;
  delete rawObject.includeSelectionContext;
  const input = rawObject as Partial<PidianSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(input.apiKeys ?? {}) },
    customProviders: input.customProviders ?? [],
    permissions: {
      read: input.permissions?.read ?? DEFAULT_SETTINGS.permissions.read,
      edit: input.permissions?.edit ?? DEFAULT_SETTINGS.permissions.edit,
      create: input.permissions?.create ?? DEFAULT_SETTINGS.permissions.create,
      delete: input.permissions?.delete ?? DEFAULT_SETTINGS.permissions.delete,
    },
  };
}
