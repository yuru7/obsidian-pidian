import { assertSafeNotePath } from "./notePath";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

function extensionOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return "";
  }
  return name.slice(dot + 1);
}

export const IMAGE_MIME_PNG = "image/png";
export const IMAGE_MIME_JPEG = "image/jpeg";
export const IMAGE_MIME_WEBP = "image/webp";

export type ImageMimeType = typeof IMAGE_MIME_PNG | typeof IMAGE_MIME_JPEG | typeof IMAGE_MIME_WEBP;

/** Refuse to load vault images larger than this before sending to the model. */
export const MAX_IMAGE_READ_BYTES = 15 * 1024 * 1024;

export function isImageExtension(extension: string): boolean {
  return IMAGE_EXTENSIONS.has(extension.toLowerCase());
}

export function isImageFilePath(path: string): boolean {
  return isImageExtension(extensionOf(path));
}

export function assertImageFilePath(path: string): string {
  const normalized = assertSafeNotePath(path);
  if (!isImageFilePath(normalized)) {
    throw new Error(
      `Not an image: ${normalized}. Only PNG (.png), JPEG (.jpg, .jpeg), and WebP (.webp) can be read.`,
    );
  }
  return normalized;
}

export function detectImageMimeType(bytes: Uint8Array): ImageMimeType | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return IMAGE_MIME_PNG;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return IMAGE_MIME_JPEG;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return IMAGE_MIME_WEBP;
  }
  return undefined;
}

export function formatImageTooLarge(path: string, size: number): string {
  return `Image is too large to read: ${path} (${size} bytes). Maximum is ${MAX_IMAGE_READ_BYTES} bytes.`;
}

export function formatNotImageBytes(path: string): string {
  return `Not a PNG, JPEG, or WebP image: ${path}.`;
}
