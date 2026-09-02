import { describe, expect, it } from "vitest";
import { modelSupportsImages, toolsVisibleToModel } from "./visionModel";

describe("modelSupportsImages", () => {
  it("is true only when input includes image", () => {
    expect(modelSupportsImages({ input: ["text", "image"] })).toBe(true);
    expect(modelSupportsImages({ input: ["text"] })).toBe(false);
    expect(modelSupportsImages({ input: [] })).toBe(false);
    expect(modelSupportsImages({})).toBe(false);
    expect(modelSupportsImages(undefined)).toBe(false);
  });
});

describe("toolsVisibleToModel", () => {
  const tools = [{ name: "read_note" }, { name: "read_image" }, { name: "list_files" }];

  it("keeps read_image for vision models", () => {
    expect(toolsVisibleToModel(tools, { input: ["text", "image"] }).map((tool) => tool.name)).toEqual([
      "read_note",
      "read_image",
      "list_files",
    ]);
  });

  it("hides read_image from text-only models", () => {
    expect(toolsVisibleToModel(tools, { input: ["text"] }).map((tool) => tool.name)).toEqual([
      "read_note",
      "list_files",
    ]);
  });
});
