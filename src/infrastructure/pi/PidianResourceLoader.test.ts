import { describe, expect, it } from "vitest";
import {
  DefaultResourceLoader,
  loadProjectContextFiles,
  PidianResourceLoader,
} from "./PidianResourceLoader";

describe("PidianResourceLoader", () => {
  it("returns the prompt and agents files and leaves the rest empty", async () => {
    const loader = new PidianResourceLoader({
      systemPrompt: "You are Pidian",
      agentsFiles: [{ path: "pidian/AGENTS.md", content: "be concise" }],
    });

    expect(loader.getSystemPrompt()).toBe("You are Pidian");
    expect(loader.getAgentsFiles()).toEqual({
      agentsFiles: [{ path: "pidian/AGENTS.md", content: "be concise" }],
    });
    expect(loader.getSkills()).toEqual({ skills: [], diagnostics: [] });
    expect(loader.getPrompts()).toEqual({ prompts: [], diagnostics: [] });
    expect(loader.getThemes()).toEqual({ themes: [], diagnostics: [] });
    expect(loader.getAppendSystemPrompt()).toEqual([]);
    expect(loader.getSystemPromptSource()).toBeUndefined();

    const extensions = loader.getExtensions();
    expect(extensions.extensions).toEqual([]);
    expect(extensions.errors).toEqual([]);
    expect(extensions.runtime.flagValues).toBeInstanceOf(Map);

    await expect(loader.reload()).resolves.toBeUndefined();
  });

  it("keeps the DefaultResourceLoader export for Pi's sdk fallback", () => {
    expect(DefaultResourceLoader).toBe(PidianResourceLoader);
    expect(loadProjectContextFiles()).toEqual([]);
  });
});
