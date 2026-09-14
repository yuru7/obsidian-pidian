import { afterEach, describe, expect, it, vi } from "vitest";
import { isTextareaLineBreakInput, scrollTextareaCaretIntoView } from "./fitTextarea";

afterEach(() => {
  vi.unstubAllGlobals();
});

function textarea(partial: {
  value: string;
  selectionEnd?: number;
  scrollHeight: number;
  clientHeight: number;
  scrollTop?: number;
}): HTMLTextAreaElement {
  const selectionEnd = partial.selectionEnd ?? partial.value.length;
  return {
    value: partial.value,
    selectionEnd,
    scrollHeight: partial.scrollHeight,
    clientHeight: partial.clientHeight,
    scrollTop: partial.scrollTop ?? 0,
  } as HTMLTextAreaElement;
}

describe("scrollTextareaCaretIntoView", () => {
  it("scrolls down when the caret is at the end below the visible area", () => {
    const el = textarea({
      value: `${"line\n".repeat(12)}end`,
      scrollHeight: 400,
      clientHeight: 160,
      scrollTop: 80,
    });
    scrollTextareaCaretIntoView(el);
    expect(el.scrollTop).toBe(240);
  });

  it("does not move scroll when content fits", () => {
    const el = textarea({
      value: "short",
      scrollHeight: 80,
      clientHeight: 160,
      scrollTop: 0,
    });
    scrollTextareaCaretIntoView(el);
    expect(el.scrollTop).toBe(0);
  });

  it("does not jump to the bottom when the caret is already visible", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      fontSize: "14px",
      lineHeight: "20px",
      paddingTop: "6px",
      paddingBottom: "6px",
      borderTopWidth: "0px",
    }));
    const el = textarea({
      value: `${"line\n".repeat(12)}end`,
      selectionEnd: 4,
      scrollHeight: 400,
      clientHeight: 160,
      scrollTop: 0,
    });
    scrollTextareaCaretIntoView(el);
    expect(el.scrollTop).toBe(0);
  });

  it("scrolls down when a mid-text caret is below the visible area", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      fontSize: "14px",
      lineHeight: "20px",
      paddingTop: "6px",
      paddingBottom: "6px",
      borderTopWidth: "0px",
    }));
    const el = textarea({
      value: `${"line\n".repeat(12)}end`,
      selectionEnd: `${"line\n".repeat(9)}line`.length,
      scrollHeight: 400,
      clientHeight: 160,
      scrollTop: 0,
    });
    scrollTextareaCaretIntoView(el);
    // 10 lines * 20px + 6px padding = 206, minus clientHeight 160.
    expect(el.scrollTop).toBe(46);
  });

  it("scrolls up when the caret is above the visible area", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      fontSize: "14px",
      lineHeight: "20px",
      paddingTop: "6px",
      paddingBottom: "6px",
      borderTopWidth: "0px",
    }));
    const el = textarea({
      value: `${"line\n".repeat(12)}end`,
      selectionEnd: 4,
      scrollHeight: 400,
      clientHeight: 160,
      scrollTop: 200,
    });
    scrollTextareaCaretIntoView(el);
    expect(el.scrollTop).toBe(6);
  });
});

describe("isTextareaLineBreakInput", () => {
  it("is true only for line-break input types", () => {
    expect(isTextareaLineBreakInput(Object.assign(new Event("input"), { inputType: "insertLineBreak" }))).toBe(true);
    expect(isTextareaLineBreakInput(Object.assign(new Event("input"), { inputType: "insertParagraph" }))).toBe(true);
    expect(isTextareaLineBreakInput(Object.assign(new Event("input"), { inputType: "insertText" }))).toBe(false);
    expect(isTextareaLineBreakInput(Object.assign(new Event("keyup"), { key: "ArrowDown" }))).toBe(false);
  });
});
