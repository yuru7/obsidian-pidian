import { describe, expect, it } from "vitest";
import { ContextService, formatAgentPrompt } from "./ContextService";
import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";

const snapshot: ContextSnapshot = {
  notePath: "notes/example.md",
  startLine: 12,
  endLine: 12,
};

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

describe("formatAgentPrompt", () => {
  it("sends the note path and cursor line without the note body", () => {
    expect(formatAgentPrompt("rewrite this", snapshot)).toBe(
      "notes/example.md L12\nUser: rewrite this",
    );
  });

  it("sends the selected line range when the selection spans lines", () => {
    expect(
      formatAgentPrompt("rewrite this", {
        notePath: "notes/example.md",
        startLine: 13,
        endLine: 15,
      }),
    ).toBe("notes/example.md L13-L15\nUser: rewrite this");
  });

  it("labels the user text when there is no active note", () => {
    expect(formatAgentPrompt("hello")).toBe("User: hello");
  });
});
