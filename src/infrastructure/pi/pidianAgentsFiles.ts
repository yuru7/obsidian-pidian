import { AGENTS_FILE_PATH } from "../../application/notePath";

export function normalizeAgentsContent(content: string | undefined): string | undefined {
  const trimmed = content?.trim();
  return trimmed ? trimmed : undefined;
}

export function pidianAgentsFiles(content: string | undefined): Array<{ path: string; content: string }> {
  const trimmed = normalizeAgentsContent(content);
  return trimmed ? [{ path: AGENTS_FILE_PATH, content: trimmed }] : [];
}
