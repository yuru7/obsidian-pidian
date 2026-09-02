export const NAME_GLOB_RULE =
  "glob filters by file name in this directory. Use * only (for example *.json). Do not use /, \\, **, or ...";

/** Returns undefined when glob is omitted or blank (no filter). */
export function parseOptionalNameGlob(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("glob must be a string.");
  }
  const glob = value.trim();
  if (!glob) {
    return undefined;
  }
  if (glob.includes("/") || glob.includes("\\") || glob.includes("**") || glob.includes("..")) {
    throw new Error(NAME_GLOB_RULE);
  }
  return glob;
}

export function matchesNameGlob(name: string, glob: string): boolean {
  return nameGlobToRegExp(glob).test(name);
}

function nameGlobToRegExp(glob: string): RegExp {
  let pattern = "";
  for (const char of glob) {
    if (char === "*") {
      if (!pattern.endsWith(".*")) {
        pattern += ".*";
      }
    } else {
      pattern += escapeRegexChar(char);
    }
  }
  return new RegExp(`^${pattern}$`, "i");
}

function escapeRegexChar(char: string): string {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}
