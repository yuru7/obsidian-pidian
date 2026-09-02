import { describe, expect, it } from "vitest";
import { isExactFilenameMatch, isPartialFilenameMatch, selectFilenameHits } from "./filenameSearch";

describe("filenameSearch", () => {
  it("matches a file name exactly, ignoring case, extension, and extra spaces", () => {
    expect(isExactFilenameMatch("notes/Hello World.md", "hello world")).toBe(true);
    expect(isExactFilenameMatch("notes/Hello World.md", "Hello  World.md")).toBe(true);
    expect(isExactFilenameMatch("notes/Hello World.md", "HELLO WORLD")).toBe(true);
    expect(isExactFilenameMatch("notes/Hello World.md", "notes/Hello World.md")).toBe(true);
    expect(isExactFilenameMatch("maps/Board.canvas", "board")).toBe(true);
    expect(isExactFilenameMatch("maps/Board.canvas", "Board.canvas")).toBe(true);
  });

  it("does not treat a substring as an exact match", () => {
    expect(isExactFilenameMatch("notes/Hello World.md", "Hello")).toBe(false);
    expect(isExactFilenameMatch("notes/My Note.md", "Note")).toBe(false);
    expect(isExactFilenameMatch("notes/HelloWorld.md", "Hello World")).toBe(false);
  });

  it("matches a substring or whitespace-insensitive name as a partial match", () => {
    expect(isPartialFilenameMatch("notes/Hello World.md", "Hello")).toBe(true);
    expect(isPartialFilenameMatch("notes/Hello World.md", "World")).toBe(true);
    expect(isPartialFilenameMatch("notes/HelloWorld.md", "Hello World")).toBe(true);
    expect(isPartialFilenameMatch("notes/Hello World.md", "HelloWorld")).toBe(true);
    expect(isPartialFilenameMatch("notes/Hello World.md", "missing")).toBe(false);
  });

  it("returns exact hits when any exist, otherwise falls back to partial hits", () => {
    const paths = ["notes/Note.md", "notes/My Note.md", "notes/Notebook.md"];
    expect(selectFilenameHits(paths, "Note")).toEqual(["notes/Note.md"]);
    expect(selectFilenameHits(paths, "My Note")).toEqual(["notes/My Note.md"]);
    expect(selectFilenameHits(paths, "book")).toEqual(["notes/Notebook.md"]);
    expect(selectFilenameHits(paths, "MyNote")).toEqual(["notes/My Note.md"]);
  });
});
