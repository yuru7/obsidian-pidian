import { describe, expect, it } from "vitest";
import { IMAGE_MIME_PNG } from "../../application/imageFile";
import { PNG_1X1 } from "../../application/imageFile.test";
import { bytesToBase64, MAX_INLINE_IMAGE_BYTES, prepareInlineImage, toPiToolContent } from "./prepareToolImage";

describe("toPiToolContent", () => {
  it("maps text-only results", async () => {
    await expect(toPiToolContent({ content: "ok" })).resolves.toEqual([{ type: "text", text: "ok" }]);
  });

  it("attaches image blocks for this turn and keeps the text stub", async () => {
    const content = await toPiToolContent({
      content: JSON.stringify({ path: "img/photo.png", mimeType: IMAGE_MIME_PNG, byteLength: PNG_1X1.byteLength }),
      images: [{ mimeType: IMAGE_MIME_PNG, bytes: PNG_1X1 }],
    });
    expect(content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ path: "img/photo.png", mimeType: IMAGE_MIME_PNG, byteLength: PNG_1X1.byteLength }),
      },
      { type: "image", data: bytesToBase64(PNG_1X1), mimeType: IMAGE_MIME_PNG },
    ]);
  });

  it("does not attach images when the tool result is an error", async () => {
    const content = await toPiToolContent({
      content: "denied",
      isError: true,
      images: [{ mimeType: IMAGE_MIME_PNG, bytes: PNG_1X1 }],
    });
    expect(content).toEqual([{ type: "text", text: "denied" }]);
  });

  it("omits image blocks when the model does not support vision", async () => {
    const stub = JSON.stringify({ path: "img/photo.png", mimeType: IMAGE_MIME_PNG, byteLength: PNG_1X1.byteLength });
    const content = await toPiToolContent(
      {
        content: stub,
        images: [{ mimeType: IMAGE_MIME_PNG, bytes: PNG_1X1 }],
      },
      { supportsImages: false },
    );
    expect(content).toEqual([
      {
        type: "text",
        text: `${stub}\n[Current model does not support images. The image was omitted.]`,
      },
    ]);
  });
});

describe("prepareInlineImage", () => {
  it("encodes images that already fit the inline limit", async () => {
    const prepared = await prepareInlineImage({ mimeType: IMAGE_MIME_PNG, bytes: PNG_1X1 });
    expect(prepared).toEqual({
      ok: true,
      data: bytesToBase64(PNG_1X1),
      mimeType: IMAGE_MIME_PNG,
    });
  });

  it("omits oversized images when they cannot be resized", async () => {
    const bytes = new Uint8Array(Math.ceil((MAX_INLINE_IMAGE_BYTES * 3) / 4) + 16);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const prepared = await prepareInlineImage({ mimeType: IMAGE_MIME_PNG, bytes });
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.message).toContain("omitted");
    }
  });
});
