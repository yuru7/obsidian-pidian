export const READ_NOTE_MAX_LINES = 2000;
export const READ_NOTE_MAX_BYTES = 50 * 1024;
export const READ_NOTE_CONTEXT_CHARS = 50;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

export interface ReadRangeResult {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  beforeContext: string;
  afterContext: string;
  startColumn?: number;
  endColumn?: number;
  nextOffset?: number;
}

export function utf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).length;
}

export function truncateToUtf8Bytes(text: string, maxBytes: number): string {
  const bytes = utf8Encoder.encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }
  let end = Math.max(0, maxBytes);
  if (end < bytes.length) {
    while (end > 0) {
      const byte = bytes[end];
      if (byte === undefined || (byte & 0xc0) !== 0x80) {
        break;
      }
      end -= 1;
    }
  }
  return utf8Decoder.decode(bytes.subarray(0, end));
}

export function sliceNoteContent(
  content: string,
  offset: number,
  limit: number,
  startColumn?: number,
  endColumn?: number,
): ReadRangeResult {
  const lines = content.split("\n");
  const totalLines = lines.length;
  if (offset > totalLines) {
    throw new Error(`offset ${offset} is past the end of the file (${totalLines} lines).`);
  }
  assertOptionalPositiveInt(startColumn, "startColumn");
  assertOptionalPositiveInt(endColumn, "endColumn");

  const maxLines = Math.min(limit, READ_NOTE_MAX_LINES);
  const startIndex = offset - 1;
  const requestedLastIndex = Math.min(startIndex + maxLines - 1, totalLines - 1);
  const collected: string[] = [];
  let byteCount = 0;
  let truncatedMidLine = false;

  for (let index = startIndex; index < totalLines && collected.length < maxLines; index += 1) {
    const original = lines[index];
    if (original === undefined) {
      throw new Error(`missing line at index ${index}`);
    }
    const line = clipLine(original, index, startIndex, requestedLastIndex, startColumn, endColumn);
    const separatorBytes = collected.length === 0 ? 0 : 1;
    const lineBytes = utf8ByteLength(line);
    if (byteCount + separatorBytes + lineBytes > READ_NOTE_MAX_BYTES) {
      if (collected.length === 0) {
        collected.push(truncateToUtf8Bytes(line, READ_NOTE_MAX_BYTES));
        truncatedMidLine = true;
      }
      break;
    }
    collected.push(line);
    byteCount += separatorBytes + lineBytes;
  }

  const startLine = offset;
  const endLine = offset + collected.length - 1;
  const moreLines = endLine < totalLines;
  const truncated = moreLines || truncatedMidLine;
  const rangeContent = collected.join("\n");
  const startAt = characterOffset(lines, startIndex, startColumn);
  const endAt = startAt + rangeContent.length;
  const withColumns = startColumn !== undefined || endColumn !== undefined;

  return {
    content: rangeContent,
    startLine,
    endLine,
    totalLines,
    truncated,
    beforeContext: takeLastCodePoints(content.slice(0, startAt), READ_NOTE_CONTEXT_CHARS),
    afterContext: takeFirstCodePoints(content.slice(endAt), READ_NOTE_CONTEXT_CHARS),
    ...(withColumns && collected.length > 0
      ? {
          startColumn: columnIndex(startColumn, lines[startIndex]?.length ?? 0, 0) + 1,
          endColumn: exclusiveEndColumn(lines, endLine, endAt),
        }
      : {}),
    ...(moreLines ? { nextOffset: endLine + 1 } : {}),
  };
}

function assertOptionalPositiveInt(value: number | undefined, name: string): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function clipLine(
  line: string,
  lineIndex: number,
  startIndex: number,
  requestedLastIndex: number,
  startColumn: number | undefined,
  endColumn: number | undefined,
): string {
  const from = lineIndex === startIndex ? columnIndex(startColumn, line.length, 0) : 0;
  const to = lineIndex === requestedLastIndex ? columnIndex(endColumn, line.length, line.length) : line.length;
  if (from > to) {
    throw new Error("start position is after the end position.");
  }
  return line.slice(from, to);
}

function columnIndex(column: number | undefined, lineLength: number, fallback: number): number {
  if (column === undefined) {
    return fallback;
  }
  return Math.min(Math.max(column - 1, 0), lineLength);
}

function characterOffset(lines: string[], lineIndex: number, startColumn: number | undefined): number {
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      throw new Error(`missing line at index ${index}`);
    }
    offset += line.length + 1;
  }
  const line = lines[lineIndex];
  if (line === undefined) {
    throw new Error(`missing line at index ${lineIndex}`);
  }
  return offset + columnIndex(startColumn, line.length, 0);
}

function exclusiveEndColumn(lines: string[], endLine: number, endAt: number): number {
  const endIndex = endLine - 1;
  let lineStart = 0;
  for (let index = 0; index < endIndex; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      throw new Error(`missing line at index ${index}`);
    }
    lineStart += line.length + 1;
  }
  return endAt - lineStart + 1;
}

function takeFirstCodePoints(text: string, count: number): string {
  const points = Array.from(text);
  return points.length <= count ? text : points.slice(0, count).join("");
}

function takeLastCodePoints(text: string, count: number): string {
  const points = Array.from(text);
  return points.length <= count ? text : points.slice(-count).join("");
}
