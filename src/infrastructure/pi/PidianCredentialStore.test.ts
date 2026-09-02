import { describe, expect, it } from "vitest";
import type { StoredOAuthCredential } from "../../settings/Settings";
import { PidianCredentialStore } from "./PidianCredentialStore";

function oauth(overrides: Partial<StoredOAuthCredential> = {}): StoredOAuthCredential {
  return {
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: Date.now() + 60_000,
    accountId: "acct-1",
    ...overrides,
  };
}

describe("PidianCredentialStore", () => {
  it("hydrates stored OAuth credentials without writing on startup", async () => {
    const persisted: Record<string, StoredOAuthCredential>[] = [];
    const store = new PidianCredentialStore({
      load: () => ({ "openai-codex": oauth() }),
      persist: async (next) => {
        persisted.push(next);
      },
    });

    await expect(store.read("openai-codex")).resolves.toEqual(
      expect.objectContaining({ type: "oauth", access: "access-token", accountId: "acct-1" }),
    );
    expect(persisted).toEqual([]);
  });

  it("persists OAuth writes and extra Pi fields", async () => {
    const persisted: Record<string, StoredOAuthCredential>[] = [];
    const store = new PidianCredentialStore({
      load: () => ({}),
      persist: async (next) => {
        persisted.push(next);
      },
    });

    await store.modify("openai-codex", async () => oauth({ access: "next-access" }));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.["openai-codex"]).toEqual(
      expect.objectContaining({ type: "oauth", access: "next-access", accountId: "acct-1" }),
    );
  });

  it("removes a provider on logout and ignores API-key store entries", async () => {
    const persisted: Record<string, StoredOAuthCredential>[] = [];
    const store = new PidianCredentialStore({
      load: () => ({ "openai-codex": oauth() }),
      persist: async (next) => {
        persisted.push(next);
      },
    });

    await store.delete("openai-codex");
    expect(persisted.at(-1)).toEqual({});

    await store.modify("openai", async () => ({ type: "api_key", key: "sk" }));
    expect(persisted.at(-1)).toEqual({});
  });
});
