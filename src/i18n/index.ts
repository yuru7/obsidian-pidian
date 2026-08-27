import { getLanguage } from "obsidian";
import type { TranslationKey } from "./en";
import { lookup, resolveLocale } from "./translate";

export function locale(): string {
  return resolveLocale(readLanguage());
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return lookup(readLanguage(), key, vars);
}

function readLanguage(): string {
  try {
    if (typeof getLanguage === "function") {
      const value = getLanguage();
      if (value) {
        return value;
      }
    }
  } catch {
    // Obsidian < 1.8.7, or getLanguage unavailable.
  }
  try {
    const stored = globalThis.localStorage?.getItem("language");
    if (stored) {
      return stored;
    }
  } catch {
    // localStorage may be missing in tests.
  }
  return "en";
}

export type { TranslationKey };
