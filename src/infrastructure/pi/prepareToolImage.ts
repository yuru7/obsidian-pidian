import type { ToolExecuteResult, ToolImage } from "../../domain/tools/PidianTool";

/**
 * Pi's Photon resize is stubbed in the Obsidian bundle, so images under the
 * inline limit are sent as-is. Oversized images try Canvas in the renderer.
 */

/** Headroom below Anthropic's 5MB inline image limit. Same as Pi's default. */
export const MAX_INLINE_IMAGE_BYTES = 4.5 * 1024 * 1024;

export type PiToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export async function toPiToolContent(
  result: ToolExecuteResult,
  options?: { supportsImages?: boolean },
): Promise<PiToolContent[]> {
  let text = result.content;
  const images: PiToolContent[] = [];
  const supportsImages = options?.supportsImages !== false;
  if (!result.isError) {
    for (const image of result.images ?? []) {
      if (!supportsImages) {
        text = `${text}\n[Current model does not support images. The image was omitted.]`;
        continue;
      }
      const prepared = await prepareInlineImage(image);
      if (prepared.ok) {
        images.push({ type: "image", data: prepared.data, mimeType: prepared.mimeType });
        if (prepared.hint) {
          text = `${text}\n${prepared.hint}`;
        }
      } else {
        text = `${text}\n${prepared.message}`;
      }
    }
  }
  return [{ type: "text", text }, ...images];
}

type PreparedImage =
  | { ok: true; data: string; mimeType: string; hint?: string }
  | { ok: false; message: string };

export async function prepareInlineImage(image: ToolImage): Promise<PreparedImage> {
  const encodedSize = encodedBase64Bytes(image.bytes.byteLength);
  if (encodedSize <= MAX_INLINE_IMAGE_BYTES) {
    return { ok: true, data: bytesToBase64(image.bytes), mimeType: image.mimeType };
  }
  const resized = await downscaleWithCanvas(image);
  if (resized && encodedBase64Bytes(resized.bytes.byteLength) <= MAX_INLINE_IMAGE_BYTES) {
    return {
      ok: true,
      data: bytesToBase64(resized.bytes),
      mimeType: resized.mimeType,
      hint: `[Image resized to fit the ${Math.round(MAX_INLINE_IMAGE_BYTES / 1024 / 1024)}MB inline limit.]`,
    };
  }
  return {
    ok: false,
    message: `[Image omitted: encoded size ${encodedSize} bytes exceeds the ${MAX_INLINE_IMAGE_BYTES} byte inline limit.]`,
  };
}

function encodedBase64Bytes(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function downscaleWithCanvas(image: ToolImage): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return undefined;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([image.bytes.slice()], { type: image.mimeType }));
  } catch {
    return undefined;
  }
  try {
    const scale = Math.min(1, 2000 / bitmap.width, 2000 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToJpeg(canvas);
    if (!blob) {
      return undefined;
    }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), "image/jpeg", 0.8);
  });
}
