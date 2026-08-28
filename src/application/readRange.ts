export const READ_NOTE_MAX_LINES = 2000;
export const READ_NOTE_MAX_BYTES = 50 * 1024;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

export interface ReadRangeResult {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
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

export function sliceNoteContent(content: string, offset: number, limit: number): ReadRangeResult {
  const lines = content.split("\n");
  const totalLines = lines.length;
  if (offset > totalLines) {
    throw new Error(`offset ${offset} is past the end of the file (${totalLines} lines).`);
  }

  const maxLines = Math.min(limit, READ_NOTE_MAX_LINES);
  const startIndex = offset - 1;
  const collected: string[] = [];
  let byteCount = 0;
  let truncatedMidLine = false;

  for (let index = startIndex; index < totalLines && collected.length < maxLines; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      throw new Error(`missing line at index ${index}`);
    }
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

  return {
    content: collected.join("\n"),
    startLine,
    endLine,
    totalLines,
    truncated,
    ...(moreLines ? { nextOffset: endLine + 1 } : {}),
  };
}
