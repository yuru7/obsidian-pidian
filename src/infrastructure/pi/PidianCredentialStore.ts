import { InMemoryCredentialStore, type Credential, type CredentialStore } from "@earendil-works/pi-ai";
import { parseOAuthCredential, type StoredOAuthCredential } from "../../settings/Settings";

export interface PidianCredentialStoreOptions {
  load(): Record<string, StoredOAuthCredential>;
  persist(next: Record<string, StoredOAuthCredential>): Promise<void>;
}

/**
 * In-memory Pi credential store that mirrors OAuth entries into plugin data.
 * Does not read or write ~/.pi/agent/auth.json.
 */
export class PidianCredentialStore implements CredentialStore {
  private readonly inner = new InMemoryCredentialStore();
  private snapshot: Record<string, StoredOAuthCredential>;
  private readonly ready: Promise<void>;

  constructor(private readonly options: PidianCredentialStoreOptions) {
    this.snapshot = cloneOAuthMap(options.load());
    this.ready = this.hydrate();
  }

  async read(...args: Parameters<CredentialStore["read"]>): ReturnType<CredentialStore["read"]> {
    await this.ready;
    return this.inner.read(...args);
  }

  async list(...args: Parameters<CredentialStore["list"]>): ReturnType<CredentialStore["list"]> {
    await this.ready;
    return this.inner.list(...args);
  }

  async modify(...args: Parameters<CredentialStore["modify"]>): ReturnType<CredentialStore["modify"]> {
    await this.ready;
    const result = await this.inner.modify(...args);
    await this.sync(args[0], result);
    return result;
  }

  async delete(...args: Parameters<CredentialStore["delete"]>): ReturnType<CredentialStore["delete"]> {
    await this.ready;
    await this.inner.delete(...args);
    await this.sync(args[0], undefined);
  }

  private async hydrate(): Promise<void> {
    for (const [providerId, credential] of Object.entries(this.snapshot)) {
      await this.inner.modify(providerId, async () => credential);
    }
  }

  private async sync(providerId: string, credential: Credential | undefined): Promise<void> {
    const stored = credential?.type === "oauth" ? toStoredOAuth(credential) : null;
    const next = cloneOAuthMap(this.snapshot);
    if (stored) {
      next[providerId] = stored;
    } else {
      delete next[providerId];
    }
    this.snapshot = next;
    await this.options.persist(cloneOAuthMap(next));
  }
}

function toStoredOAuth(credential: Credential): StoredOAuthCredential | null {
  return parseOAuthCredential(credential);
}

function cloneOAuthMap(value: Record<string, StoredOAuthCredential>): Record<string, StoredOAuthCredential> {
  const clone: Record<string, StoredOAuthCredential> = {};
  for (const [providerId, credential] of Object.entries(value)) {
    const parsed = parseOAuthCredential(credential);
    if (parsed) {
      clone[providerId] = parsed;
    }
  }
  return clone;
}
