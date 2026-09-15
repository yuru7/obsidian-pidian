/**
 * Obsidian's MarkdownRenderer (Reading View) does not parse a GFM table unless
 * a blank line precedes it. Chat replies often omit that line. Insert it for
 * display and copy only; saved session text stays as the model wrote it.
 *
 * Skip fenced code, `$$` math, and indented code so `|` there is left alone.
 */
export function ensureTableBlankLines(markdown: string): string {
  if (!markdown.includes("|")) {
    return markdown;
  }
  const newline = newlineSequence(markdown);
  const lines = markdown.split(/\r\n|\n|\r/);
  const out: string[] = [];
  let fence: Fence | undefined;
  let inMath = false;
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const body = markdownBody(line);
    if (fence) {
      if (isClosingFence(body, fence)) {
        fence = undefined;
      }
      out.push(line);
      continue;
    }
    if (inMath) {
      if (isMathFence(body)) {
        inMath = false;
      }
      out.push(line);
      continue;
    }
    const opened = openingFence(body);
    if (opened) {
      fence = opened;
      out.push(line);
      continue;
    }
    if (isMathFence(body)) {
      inMath = true;
      out.push(line);
      continue;
    }
    const nextBody = i + 1 < lines.length ? markdownBody(lines[i + 1]) : undefined;
    if (nextBody !== undefined) {
      const headerCells = tableHeaderCells(body);
      if (headerCells && isTableDelimiter(nextBody, headerCells)) {
        const previous = i > 0 ? lines[i - 1] : undefined;
        if (previous !== undefined && !isBlankLine(previous)) {
          out.push("");
          changed = true;
        }
      }
    }
    out.push(line);
  }
  return changed ? out.join(newline) : markdown;
}

function newlineSequence(markdown: string): "\r\n" | "\n" | "\r" {
  if (markdown.includes("\r\n")) {
    return "\r\n";
  }
  if (markdown.includes("\r") && !markdown.includes("\n")) {
    return "\r";
  }
  return "\n";
}

type Fence = {
  marker: "`" | "~";
  length: number;
};

const DELIMITER_CELL = /^\s*:?-{3,}:?\s*$/;

function markdownBody(line: string): string {
  return line.replace(/^(?: {0,3}> ?)+/, "");
}

function isBlankLine(line: string): boolean {
  return markdownBody(line).trim() === "";
}

function isMathFence(body: string): boolean {
  return body.trim() === "$$";
}

function leadingWhitespace(line: string): { width: number; index: number } {
  let width = 0;
  let index = 0;
  while (index < line.length) {
    const ch = line[index];
    if (ch === " ") {
      width++;
      index++;
    } else if (ch === "\t") {
      width += 4 - (width % 4);
      index++;
    } else {
      break;
    }
  }
  return { width, index };
}

function afterTableIndent(body: string): string | undefined {
  const { width, index } = leadingWhitespace(body);
  if (width >= 4) {
    return undefined;
  }
  return body.slice(index);
}

function openingFence(body: string): Fence | undefined {
  const rest = afterTableIndent(body);
  if (rest === undefined) {
    return undefined;
  }
  const match = /^(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!match) {
    return undefined;
  }
  const run = match[1];
  const info = match[2];
  const marker = run[0];
  if (marker !== "`" && marker !== "~") {
    return undefined;
  }
  if (marker === "`" && info.includes("`")) {
    return undefined;
  }
  return { marker, length: run.length };
}

function isClosingFence(body: string, open: Fence): boolean {
  const rest = afterTableIndent(body);
  if (rest === undefined) {
    return false;
  }
  const match = /^(`{3,}|~{3,})[ \t]*$/.exec(rest);
  if (!match) {
    return false;
  }
  const run = match[1];
  return run[0] === open.marker && run.length >= open.length;
}

function splitUnescapedPipes(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      current += ch + line[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function tableCells(body: string): string[] | undefined {
  const rest = afterTableIndent(body);
  if (rest === undefined || !rest.includes("|")) {
    return undefined;
  }
  const raw = splitUnescapedPipes(rest);
  if (raw.length < 2) {
    return undefined;
  }
  if (raw[0].trim() === "") {
    raw.shift();
  }
  if (raw.length > 0 && raw[raw.length - 1].trim() === "") {
    raw.pop();
  }
  return raw.length > 0 ? raw : undefined;
}

function isDelimiterCells(cells: string[]): boolean {
  return cells.every((cell) => DELIMITER_CELL.test(cell));
}

function tableHeaderCells(body: string): string[] | undefined {
  const rest = afterTableIndent(body);
  if (rest === undefined || !rest.startsWith("|")) {
    return undefined;
  }
  const cells = tableCells(body);
  if (cells === undefined || isDelimiterCells(cells)) {
    return undefined;
  }
  return cells;
}

function isTableDelimiter(body: string, headerCells: string[]): boolean {
  const cells = tableCells(body);
  return cells !== undefined && cells.length === headerCells.length && isDelimiterCells(cells);
}
