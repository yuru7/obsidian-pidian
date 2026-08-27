export interface EditorLease {
  path: string;
  getContent(): string;
  applyReplacements(
    replacements: Array<{ oldText: string; newText: string }>,
  ): Promise<string>;
}

export const MAX_EDITABLE_NOTES_ERROR = "Maximum editable note limit reached.";

export class EditorLeaseManager {
  private readonly leases = new Map<string, EditorLease>();

  constructor(
    private readonly opener: (path: string) => Promise<EditorLease>,
    private readonly getMaxNotes: () => number,
  ) {}

  has(path: string): boolean {
    return this.leases.has(path);
  }

  size(): number {
    return this.leases.size;
  }

  async acquire(path: string): Promise<EditorLease> {
    const existing = this.leases.get(path);
    if (existing) {
      return existing;
    }
    if (this.leases.size >= this.getMaxNotes()) {
      throw new Error(MAX_EDITABLE_NOTES_ERROR);
    }
    const lease = await this.opener(path);
    this.leases.set(path, lease);
    return lease;
  }

  releaseAll(): void {
    this.leases.clear();
  }
}
