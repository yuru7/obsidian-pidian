import { describe, expect, it, vi } from "vitest";
import {
  internalLinktextFromAttributes,
  linkpathFromLinktext,
  openChatNoteLink,
} from "./chatNoteLink";

describe("internalLinktextFromAttributes", () => {
  it("prefers data-href over href", () => {
    expect(internalLinktextFromAttributes("docs/ARCHITECTURE", "other.md")).toBe("docs/ARCHITECTURE");
  });

  it("falls back to href when data-href is empty", () => {
    expect(internalLinktextFromAttributes("  ", "notes/a.md")).toBe("notes/a.md");
    expect(internalLinktextFromAttributes(null, "notes/a.md")).toBe("notes/a.md");
  });

  it("returns undefined when both are empty", () => {
    expect(internalLinktextFromAttributes(null, null)).toBeUndefined();
    expect(internalLinktextFromAttributes(" ", "")).toBeUndefined();
  });
});

describe("linkpathFromLinktext", () => {
  it("keeps a vault-relative wiki path", () => {
    expect(linkpathFromLinktext("docs/ARCHITECTURE")).toBe("docs/ARCHITECTURE");
  });

  it("strips a heading or block subpath", () => {
    expect(linkpathFromLinktext("docs/ARCHITECTURE#守ること")).toBe("docs/ARCHITECTURE");
    expect(linkpathFromLinktext("notes/a#^block-id")).toBe("notes/a");
  });

  it("strips a display alias", () => {
    expect(linkpathFromLinktext("docs/ARCHITECTURE|Architecture")).toBe("docs/ARCHITECTURE");
    expect(linkpathFromLinktext("docs/ARCHITECTURE#UI|UI")).toBe("docs/ARCHITECTURE");
  });
});

describe("openChatNoteLink", () => {
  it("resolves the linkpath and opens that file", async () => {
    const openFile = vi.fn(async () => undefined);
    await openChatNoteLink("docs/ARCHITECTURE#UI", {
      resolve: (linkpath) => (linkpath === "docs/ARCHITECTURE" ? "docs/ARCHITECTURE.md" : undefined),
      openFile,
    });
    expect(openFile).toHaveBeenCalledOnce();
    expect(openFile).toHaveBeenCalledWith("docs/ARCHITECTURE.md");
  });

  it("fails when the note does not exist", async () => {
    const openFile = vi.fn(async () => undefined);
    await expect(
      openChatNoteLink("missing", {
        resolve: () => undefined,
        openFile,
      }),
    ).rejects.toThrow("File not found: missing");
    expect(openFile).not.toHaveBeenCalled();
  });
});
