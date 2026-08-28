import { SESSIONS_DIR } from "./notePath";

/** New session files use `.json.md` so they appear in Obsidian's file explorer. */
export const SESSION_FILE_EXTENSION = ".json.md";
export const LEGACY_SESSION_FILE_EXTENSION = ".json";

export function sessionFileTimestamp(createdAt: string): string {
  return createdAt.replaceAll(":", "");
}

export function newSessionFilePath(session: { id: string; createdAt: string }): string {
  return `${SESSIONS_DIR}/${sessionFileTimestamp(session.createdAt)}_${session.id}${SESSION_FILE_EXTENSION}`;
}

export function isSessionFilePath(path: string): boolean {
  return path.endsWith(SESSION_FILE_EXTENSION) || path.endsWith(LEGACY_SESSION_FILE_EXTENSION);
}

export function sessionIdFromFilePath(path: string): string | undefined {
  const name = path.replaceAll("\\", "/").split("/").pop() ?? "";
  let stem: string;
  if (name.endsWith(SESSION_FILE_EXTENSION)) {
    stem = name.slice(0, -SESSION_FILE_EXTENSION.length);
  } else if (name.endsWith(LEGACY_SESSION_FILE_EXTENSION)) {
    stem = name.slice(0, -LEGACY_SESSION_FILE_EXTENSION.length);
  } else {
    return undefined;
  }
  const separator = stem.lastIndexOf("_");
  return separator >= 0 ? stem.slice(separator + 1) : stem;
}
