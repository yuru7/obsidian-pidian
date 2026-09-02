export const READ_IMAGE_TOOL = "read_image";

export function modelSupportsImages(model: { input?: readonly string[] } | undefined): boolean {
  return Boolean(model?.input?.includes("image"));
}

export function toolsVisibleToModel<T extends { name: string }>(
  tools: readonly T[],
  model: { input?: readonly string[] } | undefined,
): T[] {
  if (modelSupportsImages(model)) {
    return [...tools];
  }
  return tools.filter((tool) => tool.name !== READ_IMAGE_TOOL);
}
