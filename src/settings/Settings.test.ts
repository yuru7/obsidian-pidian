import { describe, expect, it } from "vitest";
import { mergeSettings } from "./Settings";

describe("mergeSettings", () => {
  it("drops the former search permission and defaults delete to deny", () => {
    const merged = mergeSettings({
      maxEditableNotes: 8,
      permissions: {
        read: "ask",
        search: "deny",
        create: "allow",
        edit: "ask",
      },
    });
    expect(merged.permissions).toEqual({
      read: "ask",
      edit: "ask",
      create: "allow",
      delete: "deny",
    });
    expect("maxEditableNotes" in merged).toBe(false);
  });

  it("drops the former selection context setting", () => {
    const merged = mergeSettings({
      includeSelectionContext: true,
    });
    expect("includeSelectionContext" in merged).toBe(false);
  });
});
