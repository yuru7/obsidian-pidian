import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import type { NoteMetadata, NoteMetadataField, NoteMetadataIndex, VaultLinks, VaultLinksQuery } from "../domain/notes/NoteMetadata";
import { createGetVaultLinksTool } from "./GetVaultLinksTool";

class MemoryMetadata implements NoteMetadataIndex {
  readonly queries: VaultLinksQuery[] = [];

  constructor(private readonly result: VaultLinks) {}

  async getNoteMetadata(_path: string, _fields: NoteMetadataField[]): Promise<NoteMetadata> {
    throw new Error("unused");
  }

  async getVaultLinks(query: VaultLinksQuery): Promise<VaultLinks> {
    this.queries.push(query);
    return this.result;
  }
}

function allowRead() {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
    { confirm: async () => true },
  );
}

describe("get_vault_links", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createGetVaultLinksTool({
      metadata: new MemoryMetadata({ truncated: false, resolvedLinks: [], unresolvedLinks: [] }),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("returns resolved and unresolved links", async () => {
    const payload: VaultLinks = {
      truncated: false,
      resolvedLinks: [{ path: "a.md", links: { "b.md": 2 } }],
      unresolvedLinks: [{ path: "a.md", links: { Missing: 1 } }],
    };
    const metadata = new MemoryMetadata(payload);
    const tool = createGetVaultLinksTool({ metadata, permissions: allowRead() });
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual(payload);
    expect(metadata.queries).toEqual([
      { fields: ["resolvedLinks", "unresolvedLinks"], path: undefined, limit: 200 },
    ]);
  });

  it("passes path, fields, and limit", async () => {
    const metadata = new MemoryMetadata({ truncated: true, resolvedLinks: [] });
    const tool = createGetVaultLinksTool({ metadata, permissions: allowRead() });
    const result = await tool.execute({
      path: "notes",
      fields: ["resolvedLinks"],
      limit: 10,
    });
    expect(result.isError).toBeFalsy();
    expect(metadata.queries).toEqual([{ fields: ["resolvedLinks"], path: "notes", limit: 10 }]);
  });

  it("rejects an unknown field name", async () => {
    const tool = createGetVaultLinksTool({
      metadata: new MemoryMetadata({ truncated: false }),
      permissions: allowRead(),
    });
    const result = await tool.execute({ fields: ["orphans"] });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("unknown value: orphans");
  });
});
