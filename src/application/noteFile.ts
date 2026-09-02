import { assertSafeNotePath } from "./notePath";

const NOTE_EXTENSIONS = new Set(["md", "canvas"]);

export function fileExtensionOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return "";
  }
  return name.slice(dot + 1);
}

export function isNoteExtension(extension: string): boolean {
  return NOTE_EXTENSIONS.has(extension.toLowerCase());
}

export function isNoteFilePath(path: string): boolean {
  return isNoteExtension(fileExtensionOf(path));
}

export function isMarkdownFilePath(path: string): boolean {
  return fileExtensionOf(path).toLowerCase() === "md";
}

export function assertNoteFilePath(path: string): string {
  const normalized = assertSafeNotePath(path);
  if (!isNoteFilePath(normalized)) {
    throw new Error(`Not a note: ${normalized}. Only Markdown (.md) and Canvas (.canvas) files can be read or searched.`);
  }
  return normalized;
}

export function assertMarkdownFilePath(path: string): string {
  const normalized = assertNoteFilePath(path);
  if (!isMarkdownFilePath(normalized)) {
    throw new Error(`Not a Markdown file: ${normalized}. Only Markdown (.md) files can be edited.`);
  }
  return normalized;
}
