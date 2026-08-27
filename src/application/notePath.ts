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
  if (normalized === ".obsidian" || normalized.startsWith(".obsidian/")) {
    throw new UnsafeNotePathError("Notes inside .obsidian/ cannot be accessed.");
  }
  if (normalized === SESSIONS_DIR || normalized.startsWith(`${SESSIONS_DIR}/`)) {
    throw new UnsafeNotePathError("Session files cannot be accessed as notes.");
  }
  return normalized;
}

export function isExcludedFromSearch(path: string): boolean {
  const normalized = normalizeNotePath(path);
  if (normalized === ".obsidian" || normalized.startsWith(".obsidian/")) {
    return true;
  }
  if (normalized === SESSIONS_DIR || normalized.startsWith(`${SESSIONS_DIR}/`)) {
    return true;
  }
  if (normalized === AGENTS_FILE_PATH) {
    return true;
  }
  return false;
}
