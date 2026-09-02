import type { ImageMimeType } from "../../application/imageFile";

export interface VaultImage {
  path: string;
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}

export interface ImageRepository {
  read(path: string): Promise<VaultImage>;
}
