import { Menu, Notice } from "obsidian";
import { IMAGE_MIME_PNG } from "../application/imageFile";
import type { PidianImageAttachment } from "../domain/sessions/PidianSession";
import { t } from "../i18n";
import { pngBlobFromBlob } from "./clipboardImageConvert";

let openCopyImageMenu: Menu | null = null;

export function hideCopyImageMenu(): void {
  const menu = openCopyImageMenu;
  openCopyImageMenu = null;
  menu?.hide();
}

export function showCopyImageMenu(event: MouseEvent, attachment: PidianImageAttachment): void {
  event.preventDefault();
  event.stopPropagation();
  hideCopyImageMenu();
  const menu = new Menu();
  menu.setNoIcon();
  menu.addItem((item) => {
    item.setTitle(t("uiCopyImage"));
    item.onClick(() => {
      void copyImageAttachment(attachment).catch((error: unknown) => {
        console.error("Pidian: failed to copy image", error);
        new Notice(t("noticeError", { error: error instanceof Error ? error.message : String(error) }));
      });
    });
  });
  menu.onHide(() => {
    if (openCopyImageMenu === menu) {
      openCopyImageMenu = null;
    }
  });
  openCopyImageMenu = menu;
  menu.showAtMouseEvent(event);
}

export async function copyImageAttachment(attachment: PidianImageAttachment): Promise<void> {
  const binary = Buffer.from(attachment.data, "base64");
  const source = new Blob(
    [binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)],
    { type: attachment.mimeType },
  );
  const blob = await pngBlobFromBlob(source);
  if (!blob) {
    throw new Error("Could not encode image for the clipboard.");
  }
  await navigator.clipboard.write([new ClipboardItem({ [IMAGE_MIME_PNG]: blob })]);
}
