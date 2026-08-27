export function titleFromUserMessage(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) {
    return "New chat";
  }
  if (line.length <= 48) {
    return line;
  }
  return `${line.slice(0, 48)}…`;
}
