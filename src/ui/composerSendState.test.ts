import { describe, expect, it } from "vitest";
import { composerHasSendableContent, composerVisionBlocksSend } from "./composerSendState";

describe("composerVisionBlocksSend", () => {
  it("blocks send only when images are attached to a non-vision model", () => {
    expect(composerVisionBlocksSend(1, false)).toBe(true);
    expect(composerVisionBlocksSend(1, true)).toBe(false);
    expect(composerVisionBlocksSend(0, false)).toBe(false);
  });
});

describe("composerHasSendableContent", () => {
  it("allows text, images, or both", () => {
    expect(composerHasSendableContent("hi", 0)).toBe(true);
    expect(composerHasSendableContent("   ", 1)).toBe(true);
    expect(composerHasSendableContent("", 0)).toBe(false);
    expect(composerHasSendableContent("   ", 0)).toBe(false);
  });
});
