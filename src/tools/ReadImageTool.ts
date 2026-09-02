import type { ImageRepository } from "../domain/notes/ImageRepository";
import type { PidianTool } from "../domain/tools/PidianTool";
import { PermissionService } from "../application/PermissionService";
import { assertImageFilePath } from "../application/imageFile";

function parseReadImageArgs(args: unknown): { path: string } {
  if (typeof args !== "object" || args === null || typeof (args as { path?: unknown }).path !== "string") {
    throw new Error("path is required.");
  }
  return { path: assertImageFilePath((args as { path: string }).path) };
}

export function createReadImageTool(options: {
  images: ImageRepository;
  permissions: PermissionService;
}): PidianTool {
  return {
    name: "read_image",
    label: "Read image",
    description:
      "Read a PNG, JPEG, or WebP image from the Obsidian vault and send it to the model as an image. Use this when you need to see the picture. Returns path, mimeType, and byteLength. The image itself is attached for this turn only; saved sessions keep the path text, not the bytes. If the current model does not support vision, the image may be omitted.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path to the image, for example attachments/diagram.png",
        },
      },
      required: ["path"],
    },
    execute: async (args) => {
      try {
        const { path } = parseReadImageArgs(args);
        const decision = await options.permissions.authorize({
          category: "read",
          toolName: "read_image",
          summary: `Read ${path}`,
        });
        if (!decision.allowed) {
          return { content: decision.reason ?? "Tool execution denied by user", isError: true };
        }
        const image = await options.images.read(path);
        return {
          content: JSON.stringify(
            {
              path: image.path,
              mimeType: image.mimeType,
              byteLength: image.bytes.byteLength,
            },
            null,
            2,
          ),
          images: [{ mimeType: image.mimeType, bytes: image.bytes }],
        };
      } catch (error) {
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
  };
}
