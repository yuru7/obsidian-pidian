import { describe, expect, it } from "vitest";
import { bindConfigDir } from "./notePath";
import {
  assertMarkdownFilePath,
  assertNoteFilePath,
  fileExtensionOf,
  isContextFilePath,
  isNoteExtension,
  isNoteFilePath,
} from "./noteFile";

bindConfigDir(() => "vault-config");

describe("noteFile", () => {
  it("treats Markdown and Canvas as notes", () => {
    expect(isNoteExtension("md")).toBe(true);
    expect(isNoteExtension("MD")).toBe(true);
    expect(isNoteExtension("canvas")).toBe(true);
    expect(isNoteExtension("png")).toBe(false);
    expect(isNoteExtension("json")).toBe(false);
    expect(isNoteFilePath("notes/a.md")).toBe(true);
    expect(isNoteFilePath("maps/board.canvas")).toBe(true);
    expect(isNoteFilePath("img/photo.png")).toBe(false);
    expect(isNoteFilePath("data.json")).toBe(false);
    expect(isContextFilePath("img/photo.png")).toBe(true);
    expect(isContextFilePath("img/photo.gif")).toBe(false);
  });

  it("reads the last extension from a vault path", () => {
    expect(fileExtensionOf("notes/Hello World.md")).toBe("md");
    expect(fileExtensionOf("maps/board.canvas")).toBe("canvas");
    expect(fileExtensionOf("foo.bar.canvas")).toBe("canvas");
    expect(fileExtensionOf("README")).toBe("");
  });

  it("allows Markdown and Canvas paths and rejects other files", () => {
    expect(assertNoteFilePath("notes/a.md")).toBe("notes/a.md");
    expect(assertNoteFilePath("maps/board.canvas")).toBe("maps/board.canvas");
    expect(() => assertNoteFilePath("img/photo.png")).toThrow(/Not a note/);
    expect(() => assertNoteFilePath("../secret.md")).toThrow();
  });

  it("allows Markdown paths for editing and rejects Canvas", () => {
    expect(assertMarkdownFilePath("notes/a.md")).toBe("notes/a.md");
    expect(() => assertMarkdownFilePath("maps/board.canvas")).toThrow(/Not a Markdown file/);
    expect(() => assertMarkdownFilePath("img/photo.png")).toThrow(/Not a note/);
  });
});
