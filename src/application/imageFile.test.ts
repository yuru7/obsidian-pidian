import { describe, expect, it } from "vitest";
import { bindConfigDir } from "./notePath";
import {
  assertImageFilePath,
  detectImageMimeType,
  IMAGE_MIME_JPEG,
  IMAGE_MIME_PNG,
  IMAGE_MIME_WEBP,
  isImageExtension,
  isImageFilePath,
} from "./imageFile";
import { isContextFilePath } from "./noteFile";

bindConfigDir(() => "vault-config");

export const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49,
  0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("imageFile", () => {
  it("treats PNG, JPEG, and WebP as images", () => {
    expect(isImageExtension("png")).toBe(true);
    expect(isImageExtension("PNG")).toBe(true);
    expect(isImageExtension("jpg")).toBe(true);
    expect(isImageExtension("jpeg")).toBe(true);
    expect(isImageExtension("webp")).toBe(true);
    expect(isImageExtension("gif")).toBe(false);
    expect(isImageExtension("md")).toBe(false);
    expect(isImageFilePath("img/photo.png")).toBe(true);
    expect(isImageFilePath("img/photo.JPG")).toBe(true);
    expect(isImageFilePath("img/photo.jpeg")).toBe(true);
    expect(isImageFilePath("img/photo.webp")).toBe(true);
    expect(isImageFilePath("img/photo.gif")).toBe(false);
    expect(isImageFilePath("notes/a.md")).toBe(false);
  });

  it("allows image paths and rejects other files", () => {
    expect(assertImageFilePath("img/photo.png")).toBe("img/photo.png");
    expect(assertImageFilePath("img/photo.jpg")).toBe("img/photo.jpg");
    expect(() => assertImageFilePath("img/photo.gif")).toThrow(/Not an image/);
    expect(() => assertImageFilePath("notes/a.md")).toThrow(/Not an image/);
    expect(() => assertImageFilePath("../secret.png")).toThrow();
  });

  it("detects PNG, JPEG, and WebP magic bytes", () => {
    expect(detectImageMimeType(PNG_1X1)).toBe(IMAGE_MIME_PNG);
    expect(detectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(IMAGE_MIME_JPEG);
    expect(
      detectImageMimeType(
        Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe(IMAGE_MIME_WEBP);
    expect(detectImageMimeType(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBeUndefined();
  });
});

describe("isContextFilePath", () => {
  it("includes notes and readable images", () => {
    expect(isContextFilePath("notes/a.md")).toBe(true);
    expect(isContextFilePath("maps/board.canvas")).toBe(true);
    expect(isContextFilePath("img/photo.png")).toBe(true);
    expect(isContextFilePath("img/photo.jpg")).toBe(true);
    expect(isContextFilePath("img/photo.webp")).toBe(true);
    expect(isContextFilePath("img/photo.gif")).toBe(false);
    expect(isContextFilePath("data.json")).toBe(false);
  });
});
