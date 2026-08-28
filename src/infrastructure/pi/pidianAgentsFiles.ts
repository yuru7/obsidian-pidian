import { agentsFilePath } from "../../application/notePath";

export function normalizeAgentsContent(content: string | undefined): string | undefined {
  const trimmed = content?.trim();
  return trimmed ? trimmed : undefined;
}

export function pidianAgentsFiles(
  content: string | undefined,
  path = agentsFilePath(),
): Array<{ path: string; content: string }> {
  const trimmed = normalizeAgentsContent(content);
  return trimmed ? [{ path, content: trimmed }] : [];
}
