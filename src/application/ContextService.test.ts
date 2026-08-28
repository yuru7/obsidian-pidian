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
    const prompt = formatAgentPrompt("rewrite this", snapshot);
    expect(prompt).toContain("Current note:\nnotes/example.md");
    expect(prompt).toContain("Cursor:\nLine 12");
    expect(prompt).toContain("rewrite this");
    expect(prompt).not.toContain("column");
    expect(prompt).not.toContain("Current note content");
    expect(prompt).not.toContain("Selected text");
  });

  it("sends the selected line range when the selection spans lines", () => {
    const prompt = formatAgentPrompt("rewrite this", {
      notePath: "notes/example.md",
      startLine: 13,
      endLine: 15,
    });
    expect(prompt).toContain("Selection:\nLines 13-15");
    expect(prompt).not.toContain("Cursor:");
  });

  it("returns the user text when there is no active note", () => {
    expect(formatAgentPrompt("hello")).toBe("hello");
  });
});
