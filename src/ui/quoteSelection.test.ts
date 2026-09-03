import { describe, expect, it } from "vitest";
import { formatQuoteMarkdown, insertQuoteIntoComposer } from "./quoteSelection";

describe("formatQuoteMarkdown", () => {
  it("prefixes a single line with a blockquote marker", () => {
    expect(formatQuoteMarkdown("hello")).toBe("> hello");
  });

  it("prefixes each line, including blank lines", () => {
    expect(formatQuoteMarkdown("hello\n\nworld")).toBe("> hello\n>\n> world");
  });

  it("trims surrounding whitespace and normalizes newlines", () => {
    expect(formatQuoteMarkdown("  foo\r\nbar  \n")).toBe("> foo\n> bar");
  });

  it("returns empty for whitespace-only input", () => {
    expect(formatQuoteMarkdown("  \n\t")).toBe("");
  });
});

describe("insertQuoteIntoComposer", () => {
  it("inserts at the start of an empty composer and leaves a blank line before the cursor", () => {
    expect(insertQuoteIntoComposer("", "hello")).toEqual({
      text: "> hello\n\n",
      cursor: "> hello\n\n".length,
    });
  });

  it("quotes each line when the selection has multiple lines", () => {
    expect(insertQuoteIntoComposer("", "a\nb")).toEqual({
      text: "> a\n> b\n\n",
      cursor: "> a\n> b\n\n".length,
    });
  });

  it("appends after existing text that already ends with a blank line", () => {
    expect(insertQuoteIntoComposer("draft\n\n", "hello")).toEqual({
      text: "draft\n\n> hello\n\n",
      cursor: "draft\n\n> hello\n\n".length,
    });
  });

  it("adds one newline when the composer already ends with a single newline", () => {
    expect(insertQuoteIntoComposer("draft\n", "hello")).toEqual({
      text: "draft\n\n> hello\n\n",
      cursor: "draft\n\n> hello\n\n".length,
    });
  });

  it("adds two newlines when the composer does not end with a newline", () => {
    expect(insertQuoteIntoComposer("draft", "hello")).toEqual({
      text: "draft\n\n> hello\n\n",
      cursor: "draft\n\n> hello\n\n".length,
    });
  });

  it("does not insert whitespace-only selections", () => {
    expect(insertQuoteIntoComposer("draft", "  \n")).toBeNull();
  });
});
