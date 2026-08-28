export const DEFAULT_PLUGIN_DIRECTORY = "pidian";

let resolvePluginDirectory: () => string = () => DEFAULT_PLUGIN_DIRECTORY;

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

export function getPluginDirectory(): string {
  return parsePluginDirectory(resolvePluginDirectory());
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
  if (normalized === ".obsidian" || normalized.startsWith(".obsidian/")) {
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
      normalized === ".obsidian" || normalized.startsWith(".obsidian/")
        ? "Notes inside .obsidian/ cannot be accessed."
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
  if (normalized === ".obsidian" || normalized.startsWith(".obsidian/")) {
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
