import { describe, expect, it } from "vitest";
import { IMAGE_MIME_PNG, MAX_IMAGE_READ_BYTES } from "./imageFile";
import { PNG_1X1 } from "./imageFile.test";
import { attachmentFromImageBytes } from "./pastedImage";

describe("attachmentFromImageBytes", () => {
  it("encodes PNG bytes as a session attachment", () => {
    const attachment = attachmentFromImageBytes(PNG_1X1);
    expect(attachment).toMatchObject({
      mimeType: IMAGE_MIME_PNG,
      data: Buffer.from(PNG_1X1).toString("base64"),
    });
    expect(attachment?.id).toBeTruthy();
  });

  it("rejects empty, oversized, and non-image bytes", () => {
    expect(attachmentFromImageBytes(new Uint8Array())).toBeUndefined();
    expect(attachmentFromImageBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBeUndefined();
    const tooBig = new Uint8Array(MAX_IMAGE_READ_BYTES + 1);
    tooBig.set(PNG_1X1);
    expect(attachmentFromImageBytes(tooBig)).toBeUndefined();
  });
});
