import type { SessionFileFormat } from "../settings/Settings";
import { SESSIONS_DIR } from "./notePath";

/** `.json.md` so session files appear in Obsidian's file explorer. */
export const SESSION_FILE_EXTENSION = ".json.md";
export const LEGACY_SESSION_FILE_EXTENSION = ".json";

export function sessionFileExtension(format: SessionFileFormat = "json.md"): string {
  return format === "json" ? LEGACY_SESSION_FILE_EXTENSION : SESSION_FILE_EXTENSION;
}

export function sessionFileTimestamp(createdAt: string): string {
  return createdAt.replaceAll(":", "");
}

export function newSessionFilePath(
  session: { id: string; createdAt: string },
  format: SessionFileFormat = "json.md",
): string {
  return `${SESSIONS_DIR}/${sessionFileTimestamp(session.createdAt)}_${session.id}${sessionFileExtension(format)}`;
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
