/**
 * Linktext from MarkdownRenderer's `a.internal-link` (no surrounding `[[ ]]`).
 * `data-href` is the wiki target; `href` is a fallback.
 */
export function internalLinktextFromAttributes(
  dataHref: string | null,
  href: string | null,
): string | undefined {
  const value = dataHref?.trim() || href?.trim();
  return value ? value : undefined;
}

/**
 * Path portion of a wiki/markdown internal linktext.
 * Strips heading/block subpath and display alias, matching parseLinktext + alias.
 */
export function linkpathFromLinktext(linktext: string): string {
  const trimmed = linktext.trim();
  if (!trimmed) {
    return "";
  }
  const hashIndex = trimmed.indexOf("#");
  let path = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const pipeIndex = path.indexOf("|");
  if (pipeIndex !== -1) {
    path = path.slice(0, pipeIndex);
  }
  return path.trim();
}

export async function openChatNoteLink(
  linktext: string,
  deps: {
    resolve: (linkpath: string) => string | undefined;
    openFile: (path: string) => Promise<void>;
  },
): Promise<void> {
  const linkpath = linkpathFromLinktext(linktext);
  if (!linkpath) {
    throw new Error("Note path must not be empty.");
  }
  const path = deps.resolve(linkpath);
  if (!path) {
    throw new Error(`File not found: ${linkpath}`);
  }
  await deps.openFile(path);
}
