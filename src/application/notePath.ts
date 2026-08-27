export const AGENTS_FILE_PATH = "pidian/AGENTS.md";
export const SESSIONS_DIR = "pidian/sessions";

export class UnsafeNotePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeNotePathError";
  }
}

export function normalizeNotePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").trim();
}

export function assertSafeNotePath(path: string): string {
  const normalized = normalizeNotePath(path);
  if (!normalized) {
    throw new UnsafeNotePathError("Note path must not be empty.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new UnsafeNotePathError("Note path must not contain parent segments.");
  }
  if (isRestrictedVaultPath(normalized)) {
    throw new UnsafeNotePathError(
      normalized === ".obsidian" || normalized.startsWith(".obsidian/")
        ? "Notes inside .obsidian/ cannot be accessed."
        : "Session files cannot be accessed as notes.",
    );
  }
  return normalized;
}

export function assertSafeDirectoryPath(path: string): string {
  const normalized = normalizeNotePath(path).replace(/\/+$/, "");
  if (!normalized || normalized === ".") {
    return "";
  }
  return assertSafeNotePath(normalized);
}

export function isRestrictedVaultPath(path: string): boolean {
  const normalized = normalizeNotePath(path);
  if (normalized === ".obsidian" || normalized.startsWith(".obsidian/")) {
    return true;
  }
  if (normalized === SESSIONS_DIR || normalized.startsWith(`${SESSIONS_DIR}/`)) {
    return true;
  }
  return false;
}

export function isExcludedFromSearch(path: string): boolean {
  if (isRestrictedVaultPath(path)) {
    return true;
  }
  if (normalizeNotePath(path) === AGENTS_FILE_PATH) {
    return true;
  }
  return false;
}
