import { describe, expect, it } from "vitest";
import { pidianAgentsFiles } from "./pidianAgentsFiles";

describe("pidianAgentsFiles", () => {
  it("loads only pidian/AGENTS.md when content exists", () => {
    expect(pidianAgentsFiles("# Instructions\n\n- 日本語で回答する")).toEqual([
      {
        path: "pidian/AGENTS.md",
        content: "# Instructions\n\n- 日本語で回答する",
      },
    ]);
  });

  it("returns no context files when the note is missing or blank", () => {
    expect(pidianAgentsFiles(undefined)).toEqual([]);
    expect(pidianAgentsFiles("")).toEqual([]);
    expect(pidianAgentsFiles("  \n")).toEqual([]);
  });

  it("trims content but keeps the vault path as the source", () => {
    expect(pidianAgentsFiles("  be concise  \n")).toEqual([
      { path: "pidian/AGENTS.md", content: "be concise" },
    ]);
  });

  it("uses a custom AGENTS.md path when provided", () => {
    expect(pidianAgentsFiles("be concise", "agent-data/AGENTS.md")).toEqual([
      { path: "agent-data/AGENTS.md", content: "be concise" },
    ]);
  });
});
