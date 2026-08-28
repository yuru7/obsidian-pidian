export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

export function parseThinkingLevel(value: unknown, fallback: ThinkingLevel = DEFAULT_THINKING_LEVEL): ThinkingLevel {
  return isThinkingLevel(value) ? value : fallback;
}

export function parseOptionalThinkingLevel(value: unknown): ThinkingLevel | undefined {
  return isThinkingLevel(value) ? value : undefined;
}

export function hasSelectableThinkingLevels(levels: readonly string[]): boolean {
  return levels.some((level) => level !== "off");
}

/** Same clamp as Pi's getSupportedThinkingLevels / clampThinkingLevel, against a catalog level list. */
export function clampThinkingLevel(requested: string | undefined, available: readonly string[]): ThinkingLevel | undefined {
  if (available.length === 0) {
    return undefined;
  }
  if (requested && available.includes(requested)) {
    return requested as ThinkingLevel;
  }
  const requestedIndex = THINKING_LEVELS.indexOf(parseThinkingLevel(requested));
  for (let index = requestedIndex; index < THINKING_LEVELS.length; index += 1) {
    const candidate = THINKING_LEVELS[index];
    if (candidate && available.includes(candidate)) {
      return candidate;
    }
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = THINKING_LEVELS[index];
    if (candidate && available.includes(candidate)) {
      return candidate;
    }
  }
  const first = available[0];
  return isThinkingLevel(first) ? first : undefined;
}

export function formatModelSelectionLabel(provider: string, model: string, thinkingLevel?: string): string {
  const base = [provider, model].filter(Boolean).join(" ");
  return thinkingLevel ? `${base} (${thinkingLevel})` : base;
}
