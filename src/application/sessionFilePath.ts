import type { SessionFileFormat } from "../settings/Settings";
import { sessionsDir } from "./notePath";

/** `.jsonl.md` so session files appear in Obsidian's file explorer. */
export const SESSION_FILE_EXTENSION = ".jsonl.md";
export const PLAIN_SESSION_FILE_EXTENSION = ".jsonl";

const SESSION_FILE_EXTENSIONS = [".jsonl.md", ".json.md", ".jsonl", ".json"] as const;

export function sessionFileExtension(format: SessionFileFormat = "jsonl.md"): string {
  return format === "jsonl" ? PLAIN_SESSION_FILE_EXTENSION : SESSION_FILE_EXTENSION;
}

export function sessionFileTimestamp(createdAt: string): string {
  return createdAt.replaceAll(":", "");
}

export function newSessionFilePath(
  session: { id: string; createdAt: string },
  format: SessionFileFormat = "jsonl.md",
  pluginDirectory?: string,
): string {
  return `${sessionsDir(pluginDirectory)}/${sessionFileTimestamp(session.createdAt)}_${session.id}${sessionFileExtension(format)}`;
}

export function isSessionFilePath(path: string): boolean {
  return sessionExtensionOf(path) !== undefined;
}

export function sessionIdFromFilePath(path: string): string | undefined {
  const name = path.replaceAll("\\", "/").split("/").pop() ?? "";
  const extension = sessionExtensionOf(name);
  if (!extension) {
    return undefined;
  }
  const stem = name.slice(0, -extension.length);
  const separator = stem.lastIndexOf("_");
  return separator >= 0 ? stem.slice(separator + 1) : stem;
}

function sessionExtensionOf(path: string): (typeof SESSION_FILE_EXTENSIONS)[number] | undefined {
  return SESSION_FILE_EXTENSIONS.find((extension) => path.endsWith(extension));
}
