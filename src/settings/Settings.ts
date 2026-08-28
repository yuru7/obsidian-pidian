import { DEFAULT_THINKING_LEVEL, parseThinkingLevel, type ThinkingLevel } from "../domain/agent/thinkingLevel";
import type { PermissionSettings } from "../domain/permissions/Permission";
import { DEFAULT_PLUGIN_DIRECTORY, parsePluginDirectory } from "../application/notePath";

export interface CustomOpenAIProvider {
  id: string;
  name: string;
  baseUrl: string;
  modelIds: string[];
  apiKey: string;
}

export function customProviderModelIds(provider: CustomOpenAIProvider): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of provider.modelIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function isConfiguredCustomProvider(provider: CustomOpenAIProvider): boolean {
  return Boolean(provider.baseUrl.trim()) && customProviderModelIds(provider).length > 0;
}

export type SessionFileFormat = "json.md" | "json";

export interface PidianSettings {
  provider: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  apiKeys: Record<string, string>;
  customProviders: CustomOpenAIProvider[];
  permissions: PermissionSettings;
  sessionFileFormat: SessionFileFormat;
  pluginDirectory: string;
  autoDeleteSessions: boolean;
  retentionDays: number;
}

export const DEFAULT_SETTINGS: PidianSettings = {
  provider: "openai",
  model: "gpt-5",
  thinkingLevel: DEFAULT_THINKING_LEVEL,
  apiKeys: {},
  customProviders: [],
  permissions: {
    read: "allow",
    edit: "ask",
    create: "deny",
    delete: "deny",
    webSearch: "deny",
  },
  sessionFileFormat: "json.md",
  pluginDirectory: DEFAULT_PLUGIN_DIRECTORY,
  autoDeleteSessions: false,
  retentionDays: 30,
};

export function parseSessionFileFormat(value: unknown): SessionFileFormat {
  return value === "json" ? "json" : "json.md";
}

function parseCustomProviders(raw: unknown): CustomOpenAIProvider[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const providers: CustomOpenAIProvider[] = [];
  for (const item of raw) {
    const parsed = parseCustomProvider(item);
    if (parsed) {
      providers.push(parsed);
    }
  }
  return providers;
}

function parseCustomProvider(raw: unknown): CustomOpenAIProvider | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  return {
    id: typeof item.id === "string" ? item.id : "",
    name: typeof item.name === "string" ? item.name : "",
    baseUrl: typeof item.baseUrl === "string" ? item.baseUrl : "",
    modelIds: parseModelIds(item),
    apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
  };
}

function parseModelIds(item: Record<string, unknown>): string[] {
  if (Array.isArray(item.modelIds)) {
    const ids = item.modelIds.filter((value): value is string => typeof value === "string");
    return ids.length > 0 ? ids : [""];
  }
  if (typeof item.modelId === "string") {
    return [item.modelId];
  }
  return [""];
}

export function mergeSettings(raw: unknown): PidianSettings {
  const rawObject = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  delete rawObject.maxEditableNotes;
  delete rawObject.includeSelectionContext;
  const input = rawObject as Partial<PidianSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(input.apiKeys ?? {}) },
    customProviders: parseCustomProviders(input.customProviders),
    sessionFileFormat: parseSessionFileFormat(input.sessionFileFormat),
    pluginDirectory: parsePluginDirectory(input.pluginDirectory),
    thinkingLevel: parseThinkingLevel(input.thinkingLevel),
    permissions: {
      read: input.permissions?.read ?? DEFAULT_SETTINGS.permissions.read,
      edit: input.permissions?.edit ?? DEFAULT_SETTINGS.permissions.edit,
      create: input.permissions?.create ?? DEFAULT_SETTINGS.permissions.create,
      delete: input.permissions?.delete ?? DEFAULT_SETTINGS.permissions.delete,
      webSearch: input.permissions?.webSearch ?? DEFAULT_SETTINGS.permissions.webSearch,
    },
  };
}
