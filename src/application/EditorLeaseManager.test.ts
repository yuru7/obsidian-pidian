import { describe, expect, it } from "vitest";
import { EditorLeaseManager, MAX_EDITABLE_NOTES_ERROR } from "./EditorLeaseManager";

describe("EditorLeaseManager", () => {
  it("reuses an existing lease and refuses a sixth note", async () => {
    const manager = new EditorLeaseManager(async (path) => {
      return {
        path,
        getContent: () => "",
        applyReplacements: async () => "",
      };
    }, () => 5);

    for (let index = 1; index <= 5; index += 1) {
      await manager.acquire(`note-${index}.md`);
    }
    await expect(manager.acquire("note-1.md")).resolves.toMatchObject({ path: "note-1.md" });
    await expect(manager.acquire("note-6.md")).rejects.toThrow(MAX_EDITABLE_NOTES_ERROR);
    expect(manager.size()).toBe(5);
  });
});
