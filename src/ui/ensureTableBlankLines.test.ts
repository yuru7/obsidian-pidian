import { describe, expect, it } from "vitest";
import { ensureTableBlankLines } from "./ensureTableBlankLines";

const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";

describe("ensureTableBlankLines", () => {
  it("returns the same string when there is no pipe", () => {
    const markdown = "hello\nworld";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("inserts a blank line before a table that follows a paragraph", () => {
    expect(ensureTableBlankLines(`Here is data:\n${table}`)).toBe(`Here is data:\n\n${table}`);
  });

  it("does not insert when a blank line is already there", () => {
    const markdown = `Here is data:\n\n${table}`;
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("does not insert when the table starts the document", () => {
    expect(ensureTableBlankLines(table)).toBe(table);
  });

  it("inserts before a table that follows a heading", () => {
    expect(ensureTableBlankLines(`## Title\n${table}`)).toBe(`## Title\n\n${table}`);
  });

  it("inserts before each table that needs a blank line", () => {
    expect(ensureTableBlankLines(`one\n${table}\ntwo\n${table}`)).toBe(
      `one\n\n${table}\ntwo\n\n${table}`,
    );
  });

  it("does not treat a header without a delimiter as a table", () => {
    const markdown = "Here is data:\n| A | B |";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("leaves a fenced code block unchanged", () => {
    const markdown = "Example:\n```\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("leaves a tilde fenced code block unchanged", () => {
    const markdown = "Example:\n~~~\n| A | B |\n| --- | --- |\n| 1 | 2 |\n~~~";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("leaves a quoted fenced example unchanged", () => {
    const markdown = "Example:\n> ```\n> | A | B |\n> | --- | --- |\n> ```";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("does not touch a table still inside an unclosed fence", () => {
    const markdown = "Example:\n```\n| A | B |\n| --- | --- |";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("inserts after a closed fence when the following table needs a blank line", () => {
    expect(ensureTableBlankLines(`\`\`\`\ncode\n\`\`\`\n${table}`)).toBe(`\`\`\`\ncode\n\`\`\`\n\n${table}`);
  });

  it("leaves a $$ math block unchanged", () => {
    const markdown = "Formula:\n$$\n| a | b |\n| --- | --- |\n$$";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("leaves an indented code table unchanged", () => {
    const markdown = "Example:\n    | A | B |\n    | --- | --- |";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("inserts before a table indented by three spaces", () => {
    expect(ensureTableBlankLines("Intro:\n   | A | B |\n   | --- | --- |")).toBe(
      "Intro:\n\n   | A | B |\n   | --- | --- |",
    );
  });

  it("does not treat mismatched pipe counts as a table", () => {
    const markdown = "Use the pipe | character\n| --- |";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });

  it("accepts alignment markers in the delimiter row", () => {
    expect(ensureTableBlankLines("Intro:\n| A | B |\n| :--- | ---: |")).toBe(
      "Intro:\n\n| A | B |\n| :--- | ---: |",
    );
  });

  it("preserves CRLF when inserting a blank line", () => {
    expect(ensureTableBlankLines("Intro:\r\n| A | B |\r\n| --- | --- |")).toBe(
      "Intro:\r\n\r\n| A | B |\r\n| --- | --- |",
    );
  });

  it("inserts before a quoted table that follows a paragraph", () => {
    expect(ensureTableBlankLines("Intro:\n> | A | B |\n> | --- | --- |")).toBe(
      "Intro:\n\n> | A | B |\n> | --- | --- |",
    );
  });

  it("does not treat a GFM table without a leading pipe as a table", () => {
    const markdown = "Intro:\nA | B\n--- | ---";
    expect(ensureTableBlankLines(markdown)).toBe(markdown);
  });
});
