export function composerVisionBlocksSend(attachmentCount: number, supportsImages: boolean): boolean {
  return attachmentCount > 0 && !supportsImages;
}

export function composerHasSendableContent(text: string, attachmentCount: number): boolean {
  return text.trim().length > 0 || attachmentCount > 0;
}
