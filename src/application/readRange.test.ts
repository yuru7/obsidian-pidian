import { describe, expect, it } from "vitest";
import {
  READ_NOTE_CONTEXT_CHARS,
  READ_NOTE_MAX_BYTES,
  READ_NOTE_MAX_LINES,
  sliceNoteContent,
  truncateToUtf8Bytes,
  utf8ByteLength,
} from "./readRange";

describe("sliceNoteContent", () => {
  it("returns the requested line range with surrounding context", () => {
    const content = ["a", "b", "c", "d", "e"].join("\n");
    expect(sliceNoteContent(content, 2, 2)).toEqual({
      content: "b\nc",
      startLine: 2,
      endLine: 3,
      totalLines: 5,
      truncated: true,
      beforeContext: "a\n",
      afterContext: "\nd\ne",
      nextOffset: 4,
    });
  });

  it("returns the whole file when it fits", () => {
    expect(sliceNoteContent("hello\nworld", 1, READ_NOTE_MAX_LINES)).toEqual({
      content: "hello\nworld",
      startLine: 1,
      endLine: 2,
      totalLines: 2,
      truncated: false,
      beforeContext: "",
      afterContext: "",
    });
  });

  it("stops at 2000 lines even when more remain", () => {
    const lines = Array.from({ length: READ_NOTE_MAX_LINES + 10 }, (_, index) => `L${index + 1}`);
    const result = sliceNoteContent(lines.join("\n"), 1, 10_000);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(READ_NOTE_MAX_LINES);
    expect(result.totalLines).toBe(READ_NOTE_MAX_LINES + 10);
    expect(result.truncated).toBe(true);
    expect(result.nextOffset).toBe(READ_NOTE_MAX_LINES + 1);
    expect(result.content.split("\n")).toHaveLength(READ_NOTE_MAX_LINES);
    expect(result.beforeContext).toBe("");
    expect(result.afterContext).toBe(
      Array.from(`\n${lines.slice(READ_NOTE_MAX_LINES).join("\n")}`)
        .slice(0, READ_NOTE_CONTEXT_CHARS)
        .join(""),
    );
  });

  it("stops at 50KB before 2000 lines when lines are large", () => {
    const line = "x".repeat(10 * 1024);
    const content = Array.from({ length: 10 }, () => line).join("\n");
    const result = sliceNoteContent(content, 1, READ_NOTE_MAX_LINES);
    expect(utf8ByteLength(result.content)).toBeLessThanOrEqual(READ_NOTE_MAX_BYTES);
    expect(result.truncated).toBe(true);
    expect(result.endLine).toBeLessThan(10);
    expect(result.nextOffset).toBe(result.endLine + 1);
    expect(result.afterContext.length).toBeGreaterThan(0);
  });

  it("truncates a single line that exceeds 50KB", () => {
    const line = "あ".repeat(READ_NOTE_MAX_BYTES);
    const result = sliceNoteContent(line, 1, READ_NOTE_MAX_LINES);
    expect(utf8ByteLength(result.content)).toBeLessThanOrEqual(READ_NOTE_MAX_BYTES);
    expect(result.content.length).toBeLessThan(line.length);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(1);
    expect(result.totalLines).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.nextOffset).toBeUndefined();
    expect(result.afterContext).toBe(
      Array.from(line.slice(result.content.length)).slice(0, READ_NOTE_CONTEXT_CHARS).join(""),
    );
  });

  it("rejects an offset past the last line", () => {
    expect(() => sliceNoteContent("one\ntwo", 3, 10)).toThrow(
      "offset 3 is past the end of the file (2 lines).",
    );
  });

  it("clips a multi-line range by start and end columns", () => {
    const content = ["abcdef", "ghijkl", "mnopqr"].join("\n");
    expect(sliceNoteContent(content, 1, 3, 4, 3)).toEqual({
      content: "def\nghijkl\nmn",
      startLine: 1,
      endLine: 3,
      startColumn: 4,
      endColumn: 3,
      totalLines: 3,
      truncated: false,
      beforeContext: "abc",
      afterContext: "opqr",
    });
  });

  it("clips a same-line column range", () => {
    const content = "abcdefghij";
    expect(sliceNoteContent(content, 1, 1, 4, 8)).toEqual({
      content: "defg",
      startLine: 1,
      endLine: 1,
      startColumn: 4,
      endColumn: 8,
      totalLines: 1,
      truncated: false,
      beforeContext: "abc",
      afterContext: "hij",
    });
  });

  it("keeps surrounding context for a line-only range", () => {
    const prefix = "x".repeat(60);
    const suffix = "y".repeat(60);
    const content = `${prefix}\nmiddle\n${suffix}`;
    const result = sliceNoteContent(content, 2, 1);
    expect(result.content).toBe("middle");
    expect(result.beforeContext).toBe(`${prefix.slice(-READ_NOTE_CONTEXT_CHARS + 1)}\n`);
    expect(result.afterContext).toBe(`\n${suffix.slice(0, READ_NOTE_CONTEXT_CHARS - 1)}`);
    expect(Array.from(result.beforeContext)).toHaveLength(READ_NOTE_CONTEXT_CHARS);
    expect(Array.from(result.afterContext)).toHaveLength(READ_NOTE_CONTEXT_CHARS);
  });

  it("rejects a same-line range whose start column is after the end column", () => {
    expect(() => sliceNoteContent("abcdef", 1, 1, 5, 2)).toThrow(
      "start position is after the end position.",
    );
  });
});

describe("truncateToUtf8Bytes", () => {
  it("does not split a multibyte character", () => {
    const text = "あいう";
    const truncated = truncateToUtf8Bytes(text, 5);
    expect(truncated).toBe("あ");
    expect(utf8ByteLength(truncated)).toBe(3);
  });
});
