import type { Replacement } from "../domain/notes/NoteEditor";

export type ReplacementResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    count += 1;
    from = index + needle.length;
  }
  return count;
}

export function applyReplacementsToText(
  content: string,
  replacements: Replacement[],
): ReplacementResult {
  if (replacements.length === 0) {
    return { ok: false, error: "No replacements were provided." };
  }

  let next = content;
  for (const replacement of replacements) {
    if (replacement.oldText.length === 0) {
      if (next.length === 0) {
        next = replacement.newText;
        continue;
      }
      return { ok: false, error: "oldText must not be empty." };
    }
    const count = countOccurrences(next, replacement.oldText);
    if (count === 0) {
      return {
        ok: false,
        error: `oldText was not found in the note:\n${replacement.oldText}`,
      };
    }
    if (count > 1) {
      return {
        ok: false,
        error: `oldText matched ${count} times and is not unique:\n${replacement.oldText}`,
      };
    }
    next = next.replace(replacement.oldText, replacement.newText);
  }
  return { ok: true, content: next };
}

export function summarizeReplacements(replacements: Replacement[]): {
  replacementCount: number;
  addedChars: number;
  removedChars: number;
} {
  return {
    replacementCount: replacements.length,
    addedChars: replacements.reduce((sum, item) => sum + item.newText.length, 0),
    removedChars: replacements.reduce((sum, item) => sum + item.oldText.length, 0),
  };
}

export function formatReplacementDiff(replacements: Replacement[]): string {
  return replacements
    .map((item, index) => {
      return `Change ${index + 1}\n- ${item.oldText}\n+ ${item.newText}`;
    })
    .join("\n\n");
}
