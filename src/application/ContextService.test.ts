import { describe, expect, it } from "vitest";
import { ContextService, formatAgentPrompt, formatLocalIso8601 } from "./ContextService";
import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";

const snapshot: ContextSnapshot = {
  notePath: "notes/example.md",
  startLine: 12,
  endLine: 12,
};

const SENT_AT = "2026-08-31T08:31:00.123Z";

describe("ContextService", () => {
  it("returns the active note snapshot as-is", () => {
    const service = new ContextService({ getActiveNote: () => snapshot });
    expect(service.snapshot()).toEqual(snapshot);
  });

  it("returns undefined when no note is active", () => {
    const service = new ContextService({ getActiveNote: () => undefined });
    expect(service.snapshot()).toBeUndefined();
  });
});

describe("formatLocalIso8601", () => {
  it("formats a UTC instant as local-offset ISO 8601 without milliseconds", () => {
    const formatted = formatLocalIso8601(SENT_AT);
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

    const date = new Date(SENT_AT);
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absolute = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
    expect(formatted).toBe(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${offset}`,
    );
    expect(Date.parse(formatted!)).toBe(Date.parse("2026-08-31T08:31:00.000Z"));
  });

  it("returns undefined for an invalid timestamp", () => {
    expect(formatLocalIso8601("not-a-date")).toBeUndefined();
    expect(formatLocalIso8601("")).toBeUndefined();
  });
});

describe("formatAgentPrompt", () => {
  it("sends the local timestamp, note path, and cursor line without the note body", () => {
    expect(formatAgentPrompt("rewrite this", snapshot, SENT_AT)).toBe(
      `${formatLocalIso8601(SENT_AT)}\nnotes/example.md L12\nUser: rewrite this`,
    );
  });

  it("sends the selected line range when the selection spans lines", () => {
    expect(
      formatAgentPrompt(
        "rewrite this",
        {
          notePath: "notes/example.md",
          startLine: 13,
          endLine: 15,
        },
        SENT_AT,
      ),
    ).toBe(`${formatLocalIso8601(SENT_AT)}\nnotes/example.md L13-L15\nUser: rewrite this`);
  });

  it("labels the user text when there is no active note", () => {
    expect(formatAgentPrompt("hello", undefined, SENT_AT)).toBe(
      `${formatLocalIso8601(SENT_AT)}\nUser: hello`,
    );
  });

  it("omits the timestamp when createdAt is missing or invalid", () => {
    expect(formatAgentPrompt("hello")).toBe("User: hello");
    expect(formatAgentPrompt("hello", snapshot, "nope")).toBe("notes/example.md L12\nUser: hello");
  });
});
