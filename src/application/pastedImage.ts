import { detectImageMimeType, MAX_IMAGE_READ_BYTES } from "./imageFile";
import type { PidianImageAttachment } from "../domain/sessions/PidianSession";

export function attachmentFromImageBytes(bytes: Uint8Array): PidianImageAttachment | undefined {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_READ_BYTES) {
    return undefined;
  }
  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) {
    return undefined;
  }
  return {
    id: crypto.randomUUID(),
    mimeType,
    data: bytesToBase64(bytes),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
