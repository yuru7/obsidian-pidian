import { describe, expect, it } from "vitest";
import { ContextService, formatAgentPrompt } from "./ContextService";
import type { ContextSnapshot } from "../domain/notes/ContextSnapshot";

const snapshot: ContextSnapshot = {
  notePath: "notes/example.md",
  noteContent: "full note",
  selection: {
    text: "selected",
    startLine: 42,
    endLine: 47,
    excerpt: "around",
  },
};

describe("ContextService", () => {
  it("omits selection when the setting is off", () => {
    const service = new ContextService({ getActiveNote: () => snapshot }, () => false);
    expect(service.snapshot()).toEqual({
      notePath: "notes/example.md",
      noteContent: "full note",
    });
  });

  it("keeps selection when the setting is on", () => {
    const service = new ContextService({ getActiveNote: () => snapshot }, () => true);
    expect(service.snapshot()?.selection?.text).toBe("selected");
  });

  it("does not put selection into the agent prompt when omitted", () => {
    const prompt = formatAgentPrompt("rewrite this", {
      notePath: "notes/example.md",
      noteContent: "full note",
    });
    expect(prompt).toContain("Current note");
    expect(prompt).toContain("full note");
    expect(prompt).not.toContain("Focused selection");
    expect(prompt).not.toContain("Selected text");
  });
});
