import { IMAGE_MIME_PNG } from "../application/imageFile";
import { attachmentFromImageBytes } from "../application/pastedImage";
import type { PidianImageAttachment } from "../domain/sessions/PidianSession";

export async function attachmentFromClipboardBlob(blob: Blob): Promise<PidianImageAttachment | undefined> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const direct = attachmentFromImageBytes(bytes);
  if (direct) {
    return direct;
  }
  const converted = await encodeBlobAsPng(blob);
  return converted ? attachmentFromImageBytes(new Uint8Array(await converted.arrayBuffer())) : undefined;
}

export async function pngBlobFromBlob(blob: Blob): Promise<Blob | undefined> {
  if (blob.type === IMAGE_MIME_PNG) {
    return blob;
  }
  return encodeBlobAsPng(blob);
}

async function encodeBlobAsPng(blob: Blob): Promise<Blob | undefined> {
  if (typeof createImageBitmap !== "function") {
    return undefined;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return undefined;
  }
  try {
    const canvas = createEl("canvas");
    canvas.width = Math.max(1, bitmap.width);
    canvas.height = Math.max(1, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    ctx.drawImage(bitmap, 0, 0);
    return canvasToPng(canvas);
  } finally {
    bitmap.close();
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), IMAGE_MIME_PNG);
  });
}
