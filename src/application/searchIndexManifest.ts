export interface FileFingerprint {
  mtime: number;
  size: number;
}

export interface SearchIndexDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export function fingerprintsEqual(left: FileFingerprint, right: FileFingerprint): boolean {
  return left.mtime === right.mtime && left.size === right.size;
}

/** Compare live Vault stats with the persisted manifest. Unchanged files are omitted. */
export function diffSearchIndexManifest(
  current: ReadonlyMap<string, FileFingerprint>,
  indexed: ReadonlyMap<string, FileFingerprint>,
): SearchIndexDiff {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const [path, fingerprint] of current) {
    const previous = indexed.get(path);
    if (!previous) {
      added.push(path);
    } else if (!fingerprintsEqual(previous, fingerprint)) {
      changed.push(path);
    }
  }

  for (const path of indexed.keys()) {
    if (!current.has(path)) {
      removed.push(path);
    }
  }

  return { added, changed, removed };
}
