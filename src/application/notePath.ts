export const DEFAULT_PLUGIN_DIRECTORY = "pidian";

let resolvePluginDirectory: () => string = () => DEFAULT_PLUGIN_DIRECTORY;
let resolveConfigDir: () => string = () => "";

export class UnsafeNotePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeNotePathError";
  }
}

export function normalizeNotePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").trim();
}

/** Live plugin directory. Bound from plugin settings in main.ts. */
export function bindPluginDirectory(resolve: () => string): void {
  resolvePluginDirectory = resolve;
}

/** Live vault config folder. Bound from Vault#configDir in main.ts. */
export function bindConfigDir(resolve: () => string): void {
  resolveConfigDir = resolve;
}

export function getPluginDirectory(): string {
  return parsePluginDirectory(resolvePluginDirectory());
}

export function getConfigDir(): string {
  return normalizeConfigDir(resolveConfigDir());
}

/** Vault config folder as shown in tool descriptions, or a fallback before bind. */
export function formatConfigDirExclusion(): string {
  const dir = getConfigDir();
  return dir ? `${dir}/` : "the vault config folder";
}

export function isValidPluginDirectory(path: string): boolean {
  const normalized = normalizeNotePath(path).replace(/\/+$/, "");
  if (!normalized) {
    return false;
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    return false;
  }
  if (isConfigDirPath(normalized)) {
    return false;
  }
  return true;
}

export function parsePluginDirectory(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_PLUGIN_DIRECTORY;
  }
  const normalized = normalizeNotePath(value).replace(/\/+$/, "");
  return isValidPluginDirectory(normalized) ? normalized : DEFAULT_PLUGIN_DIRECTORY;
}

export function agentsFilePath(pluginDirectory = getPluginDirectory()): string {
  return `${parsePluginDirectory(pluginDirectory)}/AGENTS.md`;
}

export function sessionsDir(pluginDirectory = getPluginDirectory()): string {
  return `${parsePluginDirectory(pluginDirectory)}/sessions`;
}

export function assertSafeNotePath(path: string, pluginDirectory = getPluginDirectory()): string {
  const normalized = normalizeNotePath(path);
  if (!normalized) {
    throw new UnsafeNotePathError("Note path must not be empty.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new UnsafeNotePathError("Note path must not contain parent segments.");
  }
  if (isRestrictedVaultPath(normalized, pluginDirectory)) {
    throw new UnsafeNotePathError(
      isConfigDirPath(normalized)
        ? `Notes inside ${getConfigDir()}/ cannot be accessed.`
        : "Session files cannot be accessed as notes.",
    );
  }
  return normalized;
}

export function assertSafeDirectoryPath(path: string, pluginDirectory = getPluginDirectory()): string {
  const normalized = normalizeNotePath(path).replace(/\/+$/, "");
  if (!normalized || normalized === ".") {
    return "";
  }
  return assertSafeNotePath(normalized, pluginDirectory);
}

export function isRestrictedVaultPath(path: string, pluginDirectory = getPluginDirectory()): boolean {
  const normalized = normalizeNotePath(path);
  if (isConfigDirPath(normalized)) {
    return true;
  }
  const sessions = sessionsDir(pluginDirectory);
  if (normalized === sessions || normalized.startsWith(`${sessions}/`)) {
    return true;
  }
  return false;
}

export function isExcludedFromSearch(path: string, pluginDirectory = getPluginDirectory()): boolean {
  if (isRestrictedVaultPath(path, pluginDirectory)) {
    return true;
  }
  if (normalizeNotePath(path) === agentsFilePath(pluginDirectory)) {
    return true;
  }
  return false;
}

function normalizeConfigDir(value: string): string {
  return normalizeNotePath(value).replace(/\/+$/, "");
}

function isConfigDirPath(path: string, configDir = getConfigDir()): boolean {
  const dir = normalizeConfigDir(configDir);
  if (!dir) {
    return false;
  }
  const normalized = normalizeNotePath(path);
  return normalized === dir || normalized.startsWith(`${dir}/`);
}
