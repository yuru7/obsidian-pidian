import { en, type TranslationKey } from "./en";
import { ja } from "./ja";

export const locales = { en, ja } as const;

export type LocaleCode = keyof typeof locales;

export function resolveLocale(language: string): LocaleCode {
  if (isLocaleCode(language)) {
    return language;
  }
  const base = language.split("-")[0] ?? "";
  if (isLocaleCode(base)) {
    return base;
  }
  return "en";
}

export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return text;
  }
  let result = text;
  for (const [name, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}

export function lookup(
  language: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = locales[resolveLocale(language)];
  return interpolate(dict[key] ?? en[key], vars);
}

function isLocaleCode(value: string): value is LocaleCode {
  return value in locales;
}
