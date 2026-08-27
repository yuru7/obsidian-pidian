export const NEW_CHAT_TITLE = "New chat";

export function titleFromUserMessage(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) {
    return NEW_CHAT_TITLE;
  }
  if (line.length <= 48) {
    return line;
  }
  return `${line.slice(0, 48)}…`;
}
