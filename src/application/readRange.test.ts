import { describe, expect, it } from "vitest";
import {
  READ_NOTE_MAX_BYTES,
  READ_NOTE_MAX_LINES,
  sliceNoteContent,
  truncateToUtf8Bytes,
  utf8ByteLength,
} from "./readRange";

describe("sliceNoteContent", () => {
  it("returns the requested line range", () => {
    const content = ["a", "b", "c", "d", "e"].join("\n");
    expect(sliceNoteContent(content, 2, 2)).toEqual({
      content: "b\nc",
      startLine: 2,
      endLine: 3,
      totalLines: 5,
      truncated: true,
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
  });

  it("stops at 50KB before 2000 lines when lines are large", () => {
    const line = "x".repeat(10 * 1024);
    const content = Array.from({ length: 10 }, () => line).join("\n");
    const result = sliceNoteContent(content, 1, READ_NOTE_MAX_LINES);
    expect(utf8ByteLength(result.content)).toBeLessThanOrEqual(READ_NOTE_MAX_BYTES);
    expect(result.truncated).toBe(true);
    expect(result.endLine).toBeLessThan(10);
    expect(result.nextOffset).toBe(result.endLine + 1);
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
  });

  it("rejects an offset past the last line", () => {
    expect(() => sliceNoteContent("one\ntwo", 3, 10)).toThrow(
      "offset 3 is past the end of the file (2 lines).",
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
