import { TFile, type App } from "obsidian";
import type { ImageRepository, VaultImage } from "../../domain/notes/ImageRepository";
import {
  assertImageFilePath,
  detectImageMimeType,
  formatImageTooLarge,
  formatNotImageBytes,
  MAX_IMAGE_READ_BYTES,
} from "../../application/imageFile";

export class ObsidianImageRepository implements ImageRepository {
  constructor(private readonly app: App) {}

  async read(path: string): Promise<VaultImage> {
    const normalized = assertImageFilePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`Image not found: ${normalized}`);
    }
    if (file.stat.size > MAX_IMAGE_READ_BYTES) {
      throw new Error(formatImageTooLarge(normalized, file.stat.size));
    }
    const buffer = await this.app.vault.readBinary(file);
    const bytes = new Uint8Array(buffer);
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) {
      throw new Error(formatNotImageBytes(normalized));
    }
    return { path: normalized, bytes, mimeType };
  }
}
