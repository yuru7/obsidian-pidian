import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MIME_PNG } from "../application/imageFile";
import { PNG_1X1 } from "../application/imageFile.test";

const menuHarness = vi.hoisted(() => {
  class FakeMenu {
    static instances: FakeMenu[] = [];
    noIcon = false;
    icons: string[] = [];
    hide = vi.fn(() => {
      this.onHideCallback?.();
    });
    private onHideCallback: (() => void) | undefined;

    constructor() {
      FakeMenu.instances.push(this);
    }

    setNoIcon(): this {
      this.noIcon = true;
      return this;
    }

    addItem(
      cb: (item: {
        setTitle: (title: string) => unknown;
        setIcon: (icon: string) => unknown;
        onClick: (fn: () => void) => unknown;
      }) => void,
    ): this {
      cb({
        setTitle: () => this,
        setIcon: (icon: string) => {
          this.icons.push(icon);
          return this;
        },
        onClick: () => this,
      });
      return this;
    }

    showAtMouseEvent(): this {
      return this;
    }

    onHide(callback: () => void): void {
      this.onHideCallback = callback;
    }
  }

  return { FakeMenu };
});

vi.mock("obsidian", () => ({
  Menu: menuHarness.FakeMenu,
  Notice: class Notice {},
}));

import { copyImageAttachment, hideCopyImageMenu, showCopyImageMenu } from "./copyImageAttachment";

const attachment = {
  id: "img1",
  mimeType: IMAGE_MIME_PNG,
  data: Buffer.from(PNG_1X1).toString("base64"),
};

function contextEvent(): MouseEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

describe("copyImageAttachment", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    hideCopyImageMenu();
    menuHarness.FakeMenu.instances.length = 0;
  });

  it("writes a PNG blob to the clipboard", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    class FakeClipboardItem {
      constructor(public readonly items: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write } });

    await copyImageAttachment(attachment);

    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0]?.[0]?.[0] as FakeClipboardItem;
    const payload = item.items[IMAGE_MIME_PNG];
    expect(payload).toBeInstanceOf(Blob);
    expect(payload?.type).toBe(IMAGE_MIME_PNG);
    expect(payload?.size).toBe(PNG_1X1.byteLength);
  });
});

describe("showCopyImageMenu", () => {
  beforeEach(() => {
    hideCopyImageMenu();
    menuHarness.FakeMenu.instances.length = 0;
  });

  it("omits the copy icon", () => {
    showCopyImageMenu(contextEvent(), attachment);
    const menu = menuHarness.FakeMenu.instances[0];
    expect(menu?.noIcon).toBe(true);
    expect(menu?.icons).toEqual([]);
  });

  it("hides the open menu", () => {
    showCopyImageMenu(contextEvent(), attachment);
    const menu = menuHarness.FakeMenu.instances[0];
    hideCopyImageMenu();
    expect(menu?.hide).toHaveBeenCalledTimes(1);
  });

  it("replaces a previous menu", () => {
    showCopyImageMenu(contextEvent(), attachment);
    showCopyImageMenu(contextEvent(), attachment);
    expect(menuHarness.FakeMenu.instances[0]?.hide).toHaveBeenCalledTimes(1);
    expect(menuHarness.FakeMenu.instances).toHaveLength(2);
  });
});
