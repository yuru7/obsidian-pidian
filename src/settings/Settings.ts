import { DEFAULT_THINKING_LEVEL, parseThinkingLevel, type ThinkingLevel } from "../domain/agent/thinkingLevel";
import type { PermissionSettings } from "../domain/permissions/Permission";
import { DEFAULT_PLUGIN_DIRECTORY, parsePluginDirectory } from "../application/notePath";
import { parseModelFavorites, type ModelFavorite } from "./modelFavorites";

export type { ModelFavorite };

export interface CustomProviderModel {
  id: string;
  name: string;
  modelId: string;
  extraRequestBody: string;
  /** When true, Pi registers the model with image input so read_image is available. */
  supportsImages?: boolean;
}

export interface CustomOpenAIProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: CustomProviderModel[];
  apiKey: string;
}

export function createEmptyCustomProviderModel(): CustomProviderModel {
  return {
    id: crypto.randomUUID(),
    name: "",
    modelId: "",
    extraRequestBody: "",
    supportsImages: false,
  };
}

export function customModelDisplayName(model: CustomProviderModel): string {
  return model.name.trim() || model.modelId.trim();
}

export function customProviderModels(provider: CustomOpenAIProvider): CustomProviderModel[] {
  const seen = new Set<string>();
  const models: CustomProviderModel[] = [];
  for (const raw of provider.models) {
    const modelId = raw.modelId.trim();
    if (!modelId) {
      continue;
    }
    const id = raw.id.trim() || modelId;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push({
      id,
      name: raw.name,
      modelId,
      extraRequestBody: raw.extraRequestBody,
      supportsImages: Boolean(raw.supportsImages),
    });
  }
  return models;
}

export function customProviderModelIds(provider: CustomOpenAIProvider): string[] {
  return customProviderModels(provider).map((model) => model.id);
}

export function isConfiguredCustomProvider(provider: CustomOpenAIProvider): boolean {
  return Boolean(provider.baseUrl.trim()) && customProviderModels(provider).length > 0;
}

function displayNameKey(value: string): string {
  return value.trim();
}

function displayNameKeyIgnoreCase(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function isDuplicateModelSettingName(models: readonly CustomProviderModel[], index: number): boolean {
  const name = displayNameKey(models[index]?.name ?? "");
  if (!name) {
    return false;
  }
  return models.some((model, current) => current !== index && displayNameKey(model.name) === name);
}

export function isDuplicateCustomProviderName(
  name: string,
  providerId: string,
  customProviders: readonly CustomOpenAIProvider[],
  reservedNames: readonly string[],
): boolean {
  const key = displayNameKeyIgnoreCase(name);
  if (!key) {
    return false;
  }
  if (reservedNames.some((reserved) => displayNameKeyIgnoreCase(reserved) === key)) {
    return true;
  }
  return customProviders.some((provider) => provider.id !== providerId && displayNameKeyIgnoreCase(provider.name) === key);
}

export function uniqueCustomProviderName(
  base: string,
  customProviders: readonly CustomOpenAIProvider[],
  reservedNames: readonly string[],
): string {
  if (!isDuplicateCustomProviderName(base, "", customProviders, reservedNames)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!isDuplicateCustomProviderName(candidate, "", customProviders, reservedNames)) {
      return candidate;
    }
  }
}

export function fillModelSettingNameFromId(model: CustomProviderModel, previousModelId: string, nextModelId: string): boolean {
  if (model.name.trim() && model.name !== previousModelId) {
    return false;
  }
  model.name = nextModelId;
  return true;
}

export type SessionFileFormat = "jsonl" | "jsonl.md";

export type ComposerEditMode = "livePreview" | "plain";

export interface StoredOAuthCredential {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  [key: string]: unknown;
}

export interface PidianSettings {
  provider: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  apiKeys: Record<string, string>;
  oauthCredentials: Record<string, StoredOAuthCredential>;
  customProviders: CustomOpenAIProvider[];
  permissions: PermissionSettings;
  sessionFileFormat: SessionFileFormat;
  pluginDirectory: string;
  autoDeleteSessions: boolean;
  retentionDays: number;
  limitSessionCount: boolean;
  maxSessionCount: number;
  modelFavorites: ModelFavorite[];
  firecrawlApiKey: string;
  composerEditMode: ComposerEditMode;
  sendWithCtrlEnter: boolean;
}

export const DEFAULT_SETTINGS: PidianSettings = {
  provider: "openai",
  model: "gpt-5",
  thinkingLevel: DEFAULT_THINKING_LEVEL,
  apiKeys: {},
  oauthCredentials: {},
  customProviders: [],
  permissions: {
    read: "allow",
    edit: "ask",
    create: "deny",
    delete: "deny",
    webSearch: "deny",
  },
  sessionFileFormat: "jsonl.md",
  pluginDirectory: DEFAULT_PLUGIN_DIRECTORY,
  autoDeleteSessions: false,
  retentionDays: 90,
  limitSessionCount: false,
  maxSessionCount: 5000,
  modelFavorites: [],
  firecrawlApiKey: "",
  composerEditMode: "livePreview",
  sendWithCtrlEnter: false,
};

export function parseSessionFileFormat(value: unknown): SessionFileFormat {
  return value === "jsonl" || value === "json" ? "jsonl" : "jsonl.md";
}

export function parseComposerEditMode(value: unknown): ComposerEditMode {
  return value === "plain" ? "plain" : "livePreview";
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
    models: parseCustomProviderModels(item),
    apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
  };
}

function parseCustomProviderModels(item: Record<string, unknown>): CustomProviderModel[] {
  if (Array.isArray(item.models)) {
    const models = item.models
      .map(parseCustomProviderModel)
      .filter((model): model is CustomProviderModel => model !== null);
    return models.length > 0 ? models : [emptyPlaceholderModel()];
  }
  if (Array.isArray(item.modelIds)) {
    const models = item.modelIds
      .filter((value): value is string => typeof value === "string")
      .map(modelFromLegacyId);
    return models.length > 0 ? models : [emptyPlaceholderModel()];
  }
  if (typeof item.modelId === "string") {
    return [modelFromLegacyId(item.modelId)];
  }
  return [emptyPlaceholderModel()];
}

function parseCustomProviderModel(raw: unknown): CustomProviderModel | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const modelId = typeof item.modelId === "string" ? item.modelId : "";
  const id = typeof item.id === "string" ? item.id : modelId;
  return {
    id,
    name: typeof item.name === "string" ? item.name : "",
    modelId,
    extraRequestBody: parseExtraRequestBodySetting(item.extraRequestBody),
    supportsImages: item.supportsImages === true,
  };
}

function parseExtraRequestBodySetting(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw && typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return "";
    }
  }
  return "";
}

function modelFromLegacyId(modelId: string): CustomProviderModel {
  return {
    id: modelId,
    name: modelId,
    modelId,
    extraRequestBody: "",
    supportsImages: false,
  };
}

function emptyPlaceholderModel(): CustomProviderModel {
  return { id: "", name: "", modelId: "", extraRequestBody: "", supportsImages: false };
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

function parseOAuthCredentials(raw: unknown): Record<string, StoredOAuthCredential> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const parsed: Record<string, StoredOAuthCredential> = {};
  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    const credential = parseOAuthCredential(value);
    if (credential) {
      parsed[providerId] = credential;
    }
  }
  return parsed;
}

export function parseOAuthCredential(raw: unknown): StoredOAuthCredential | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (item.type !== "oauth") {
    return null;
  }
  if (typeof item.access !== "string" || !item.access.trim()) {
    return null;
  }
  if (typeof item.refresh !== "string" || !item.refresh.trim()) {
    return null;
  }
  if (typeof item.expires !== "number" || !Number.isFinite(item.expires)) {
    return null;
  }
  return { ...item, type: "oauth", access: item.access, refresh: item.refresh, expires: item.expires };
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
    oauthCredentials: parseOAuthCredentials(input.oauthCredentials),
    customProviders: parseCustomProviders(input.customProviders),
    sessionFileFormat: parseSessionFileFormat(input.sessionFileFormat),
    pluginDirectory: parsePluginDirectory(input.pluginDirectory),
    thinkingLevel: parseThinkingLevel(input.thinkingLevel),
    modelFavorites: parseModelFavorites(input.modelFavorites),
    firecrawlApiKey: typeof input.firecrawlApiKey === "string" ? input.firecrawlApiKey : DEFAULT_SETTINGS.firecrawlApiKey,
    composerEditMode: parseComposerEditMode(input.composerEditMode),
    sendWithCtrlEnter: input.sendWithCtrlEnter === true,
    autoDeleteSessions: input.autoDeleteSessions === true,
    limitSessionCount: input.limitSessionCount === true,
    maxSessionCount: parsePositiveInt(input.maxSessionCount, DEFAULT_SETTINGS.maxSessionCount),
    permissions: {
      read: input.permissions?.read ?? DEFAULT_SETTINGS.permissions.read,
      edit: input.permissions?.edit ?? DEFAULT_SETTINGS.permissions.edit,
      create: input.permissions?.create ?? DEFAULT_SETTINGS.permissions.create,
      delete: input.permissions?.delete ?? DEFAULT_SETTINGS.permissions.delete,
      webSearch: input.permissions?.webSearch ?? DEFAULT_SETTINGS.permissions.webSearch,
    },
  };
}
