import { describe, expect, it } from "vitest";
import { clipboardHasPlainText, imageBlobsFromClipboard } from "./clipboardImage";

function clipboard(options: {
  items?: Array<{ kind: string; type: string; file?: Blob }>;
  files?: Blob[];
  text?: string;
}): DataTransfer {
  return {
    items: (options.items ?? []).map((item) => ({
      kind: item.kind,
      type: item.type,
      getAsFile: () => item.file ?? null,
    })),
    files: options.files ?? [],
    getData: (type: string) => (type === "text/plain" ? (options.text ?? "") : ""),
  } as unknown as DataTransfer;
}

describe("imageBlobsFromClipboard", () => {
  it("collects image files from clipboard items", () => {
    const png = new Blob([new Uint8Array([1])], { type: "image/png" });
    const jpeg = new Blob([new Uint8Array([2])], { type: "image/jpeg" });
    expect(
      imageBlobsFromClipboard(
        clipboard({
          items: [
            { kind: "string", type: "text/plain" },
            { kind: "file", type: "image/png", file: png },
            { kind: "file", type: "image/jpeg", file: jpeg },
            { kind: "file", type: "application/pdf" },
          ],
        }),
      ),
    ).toEqual([png, jpeg]);
  });

  it("falls back to clipboard files when items have no images", () => {
    const png = new Blob([new Uint8Array([1])], { type: "image/png" });
    expect(imageBlobsFromClipboard(clipboard({ files: [png] }))).toEqual([png]);
    expect(imageBlobsFromClipboard(null)).toEqual([]);
  });
});

describe("clipboardHasPlainText", () => {
  it("is true only when text/plain is non-empty", () => {
    expect(clipboardHasPlainText(clipboard({ text: "hi" }))).toBe(true);
    expect(clipboardHasPlainText(clipboard({ text: "" }))).toBe(false);
    expect(clipboardHasPlainText(null)).toBe(false);
  });
});
