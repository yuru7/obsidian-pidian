import { describe, expect, it } from "vitest";
import { composerInputKeyAction } from "./composerInputKey";
import { IME_ENTER_KEYCODE } from "./composerSendKey";

function key(
  name: string,
  overrides: {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
  } = {},
) {
  return {
    key: name,
    shiftKey: overrides.shiftKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
    isComposing: overrides.isComposing ?? false,
    keyCode: overrides.keyCode ?? 0,
  };
}

describe("composerInputKeyAction", () => {
  describe("Enter send mode", () => {
    const mode = { sendWithCtrlEnter: false, streaming: false, empty: true };

    it("sends on Enter", () => {
      expect(composerInputKeyAction(key("Enter"), mode)).toBe("send");
    });

    it("maps Shift+Enter to the editor's plain Enter (list continue), not a soft break", () => {
      expect(composerInputKeyAction(key("Enter", { shiftKey: true }), mode)).toBe("newline");
    });

    it("does not send on IME confirmation Enter", () => {
      expect(composerInputKeyAction(key("Enter", { isComposing: true }), mode)).toBeNull();
      expect(composerInputKeyAction(key("Enter", { keyCode: IME_ENTER_KEYCODE }), mode)).toBeNull();
      expect(composerInputKeyAction(key("Enter", { shiftKey: true, isComposing: true }), mode)).toBeNull();
    });
  });

  describe("Ctrl+Enter send mode", () => {
    const mode = { sendWithCtrlEnter: true, streaming: false, empty: true };

    it("does not send on Enter so the editor can insert a newline", () => {
      expect(composerInputKeyAction(key("Enter"), mode)).toBeNull();
    });

    it("leaves Shift+Enter to the editor when Enter already inserts a newline", () => {
      expect(composerInputKeyAction(key("Enter", { shiftKey: true }), mode)).toBeNull();
    });

    it("sends on Ctrl+Enter or Cmd+Enter", () => {
      expect(composerInputKeyAction(key("Enter", { ctrlKey: true }), mode)).toBe("send");
      expect(composerInputKeyAction(key("Enter", { metaKey: true }), mode)).toBe("send");
    });

    it("does not send on IME confirmation Enter", () => {
      expect(composerInputKeyAction(key("Enter", { isComposing: true, ctrlKey: true }), mode)).toBeNull();
      expect(composerInputKeyAction(key("Enter", { keyCode: IME_ENTER_KEYCODE, metaKey: true }), mode)).toBeNull();
    });
  });

  describe("Escape", () => {
    it("aborts while generating with an empty composer", () => {
      expect(
        composerInputKeyAction(key("Escape"), { sendWithCtrlEnter: false, streaming: true, empty: true }),
      ).toBe("abort");
    });

    it("does not abort when the composer has text, so Obsidian can handle Escape", () => {
      expect(
        composerInputKeyAction(key("Escape"), { sendWithCtrlEnter: false, streaming: true, empty: false }),
      ).toBeNull();
    });

    it("does not abort when generation is idle", () => {
      expect(
        composerInputKeyAction(key("Escape"), { sendWithCtrlEnter: false, streaming: false, empty: true }),
      ).toBeNull();
    });
  });
});
