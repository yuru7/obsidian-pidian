import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import { PNG_1X1 } from "../application/imageFile.test";
import { IMAGE_MIME_PNG } from "../application/imageFile";
import type { ImageRepository, VaultImage } from "../domain/notes/ImageRepository";
import { createReadImageTool } from "./ReadImageTool";

class MemoryImages implements ImageRepository {
  constructor(private readonly files: Map<string, VaultImage>) {}

  async read(path: string): Promise<VaultImage> {
    const image = this.files.get(path);
    if (!image) {
      throw new Error(`Image not found: ${path}`);
    }
    return image;
  }
}

function allowRead() {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }),
    { confirm: async () => true },
  );
}

describe("read_image", () => {
  it("uses read permission and refuses when read is deny", async () => {
    const tool = createReadImageTool({
      images: new MemoryImages(
        new Map([["img/photo.png", { path: "img/photo.png", bytes: PNG_1X1, mimeType: IMAGE_MIME_PNG }]]),
      ),
      permissions: new PermissionService(
        () => ({ read: "deny", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
        { confirm: async () => true },
      ),
    });

    const result = await tool.execute({ path: "img/photo.png" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
    expect(result.images).toBeUndefined();
  });

  it("returns metadata and image bytes for a PNG", async () => {
    const tool = createReadImageTool({
      images: new MemoryImages(
        new Map([["img/photo.png", { path: "img/photo.png", bytes: PNG_1X1, mimeType: IMAGE_MIME_PNG }]]),
      ),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "img/photo.png" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      path: "img/photo.png",
      mimeType: IMAGE_MIME_PNG,
      byteLength: PNG_1X1.byteLength,
    });
    expect(result.images).toEqual([{ mimeType: IMAGE_MIME_PNG, bytes: PNG_1X1 }]);
  });

  it("rejects files that are not PNG, JPEG, or WebP", async () => {
    const tool = createReadImageTool({
      images: new MemoryImages(new Map()),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "img/photo.gif" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Not an image");
    expect(result.images).toBeUndefined();
  });

  it("returns repository errors without attaching bytes", async () => {
    const tool = createReadImageTool({
      images: new MemoryImages(new Map()),
      permissions: allowRead(),
    });

    const result = await tool.execute({ path: "img/missing.png" });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("Image not found: img/missing.png");
    expect(result.images).toBeUndefined();
  });
});
