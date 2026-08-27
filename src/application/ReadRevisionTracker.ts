const READ_REQUIRED_ERROR = "Read the note before editing.";

export class ReadRevisionTracker {
  private readonly reads = new Map<string, Map<string, string>>();

  recordRead(sessionId: string, path: string, revision: string): void {
    let sessionReads = this.reads.get(sessionId);
    if (!sessionReads) {
      sessionReads = new Map();
      this.reads.set(sessionId, sessionReads);
    }
    sessionReads.set(path, revision);
  }

  getRevision(sessionId: string, path: string): string | undefined {
    return this.reads.get(sessionId)?.get(path);
  }

  requireRead(sessionId: string, path: string): string {
    const revision = this.getRevision(sessionId, path);
    if (!revision) {
      throw new Error(READ_REQUIRED_ERROR);
    }
    return revision;
  }

  clearSession(sessionId: string): void {
    this.reads.delete(sessionId);
  }
}

export const NOTE_CHANGED_AFTER_READ =
  "The note changed after it was read.\nRead the note again before editing.";
