import type { Permission } from "../domain/permissions/Permission";

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
  includeSelectionContext: boolean;
  permissions: {
    read: Permission;
    search: Permission;
    create: Permission;
    edit: Permission;
  };
  maxEditableNotes: number;
  autoDeleteSessions: boolean;
  retentionDays: number;
}

export const DEFAULT_SETTINGS: PidianSettings = {
  provider: "openai",
  model: "gpt-5",
  apiKeys: {},
  customProviders: [],
  includeSelectionContext: true,
  permissions: {
    read: "allow",
    search: "allow",
    create: "deny",
    edit: "deny",
  },
  maxEditableNotes: 5,
  autoDeleteSessions: false,
  retentionDays: 30,
};

export function mergeSettings(raw: unknown): PidianSettings {
  const input = raw && typeof raw === "object" ? (raw as Partial<PidianSettings>) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(input.apiKeys ?? {}) },
    customProviders: input.customProviders ?? [],
    permissions: {
      ...DEFAULT_SETTINGS.permissions,
      ...(input.permissions ?? {}),
    },
  };
}
