export function imageBlobsFromClipboard(data: DataTransfer | null): Blob[] {
  if (!data) {
    return [];
  }
  const blobs: Blob[] = [];
  const seen = new Set<Blob>();
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }
    const file = item.getAsFile();
    if (file && !seen.has(file)) {
      seen.add(file);
      blobs.push(file);
    }
  }
  if (blobs.length > 0) {
    return blobs;
  }
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith("image/") && !seen.has(file)) {
      seen.add(file);
      blobs.push(file);
    }
  }
  return blobs;
}

export function clipboardHasPlainText(data: DataTransfer | null): boolean {
  return Boolean(data?.getData("text/plain"));
}
