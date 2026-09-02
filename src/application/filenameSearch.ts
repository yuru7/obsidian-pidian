function fileNameParts(path: string): { path: string; name: string; basename: string } {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  return { path, name, basename: stripLastExtension(name) };
}

function normalizeExact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function stripLastExtension(value: string): string {
  return value.replace(/\.[^./]+$/i, "");
}

export function isExactFilenameMatch(path: string, query: string): boolean {
  const q = normalizeExact(query);
  if (!q) {
    return false;
  }
  const qBase = normalizeExact(stripLastExtension(query));
  const parts = fileNameParts(path);
  const candidates = [parts.path, parts.name, parts.basename];
  return candidates.some((candidate) => {
    const normalized = normalizeExact(candidate);
    if (normalized === q) {
      return true;
    }
    return qBase !== "" && normalizeExact(stripLastExtension(candidate)) === qBase;
  });
}

export function isPartialFilenameMatch(path: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return false;
  }
  const qCompact = compact(q);
  const parts = fileNameParts(path);
  const haystacks = [parts.path, parts.name, parts.basename];
  return haystacks.some((haystack) => {
    const lower = haystack.toLowerCase();
    return lower.includes(q) || (qCompact !== "" && compact(lower).includes(qCompact));
  });
}

export function selectFilenameHits(paths: string[], query: string): string[] {
  const exact = paths.filter((path) => isExactFilenameMatch(path, query));
  if (exact.length > 0) {
    return exact;
  }
  return paths.filter((path) => isPartialFilenameMatch(path, query));
}
