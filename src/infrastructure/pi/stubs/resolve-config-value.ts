/**
 * Resolves Pi auth.json values (literals and $ENV_VAR) without spawning a shell.
 * Values that start with "!" are Pi CLI command credentials; Pidian ignores them.
 * Put the API key in Pidian settings instead.
 */
type TemplatePart = { type: "literal"; value: string } | { type: "env"; name: string };
type ConfigReference = { type: "command"; config: string } | { type: "template"; parts: TemplatePart[] };

const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_VAR_NAME_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

function appendLiteral(parts: TemplatePart[], value: string): void {
  if (!value) {
    return;
  }
  const previousPart = parts[parts.length - 1];
  if (previousPart?.type === "literal") {
    previousPart.value += value;
    return;
  }
  parts.push({ type: "literal", value });
}

function parseConfigValueTemplate(config: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let index = 0;
  while (index < config.length) {
    const dollarIndex = config.indexOf("$", index);
    if (dollarIndex < 0) {
      appendLiteral(parts, config.slice(index));
      break;
    }
    appendLiteral(parts, config.slice(index, dollarIndex));
    const nextChar = config[dollarIndex + 1];
    if (nextChar === "$" || nextChar === "!") {
      appendLiteral(parts, nextChar);
      index = dollarIndex + 2;
      continue;
    }
    if (nextChar === "{") {
      const endIndex = config.indexOf("}", dollarIndex + 2);
      if (endIndex < 0) {
        appendLiteral(parts, "$");
        index = dollarIndex + 1;
        continue;
      }
      const name = config.slice(dollarIndex + 2, endIndex);
      if (ENV_VAR_NAME_RE.test(name)) {
        parts.push({ type: "env", name });
      } else {
        appendLiteral(parts, config.slice(dollarIndex, endIndex + 1));
      }
      index = endIndex + 1;
      continue;
    }
    const match = config.slice(dollarIndex + 1).match(ENV_VAR_NAME_PREFIX_RE);
    if (match) {
      parts.push({ type: "env", name: match[0] });
      index = dollarIndex + 1 + match[0].length;
      continue;
    }
    appendLiteral(parts, "$");
    index = dollarIndex + 1;
  }
  return parts;
}

function parseConfigValueReference(config: string): ConfigReference {
  if (config.startsWith("!")) {
    return { type: "command", config };
  }
  return { type: "template", parts: parseConfigValueTemplate(config) };
}

function resolveEnvConfigValue(name: string, env?: Record<string, string>): string | undefined {
  return env?.[name] || process.env[name] || undefined;
}

function getTemplateEnvVarNames(parts: TemplatePart[]): string[] {
  const names: string[] = [];
  for (const part of parts) {
    if (part.type !== "env" || names.includes(part.name)) {
      continue;
    }
    names.push(part.name);
  }
  return names;
}

function resolveTemplate(parts: TemplatePart[], env?: Record<string, string>): string | undefined {
  let resolved = "";
  for (const part of parts) {
    if (part.type === "literal") {
      resolved += part.value;
      continue;
    }
    const envValue = resolveEnvConfigValue(part.name, env);
    if (envValue === undefined) {
      return undefined;
    }
    resolved += envValue;
  }
  return resolved;
}

export function getConfigValueEnvVarName(config: string): string | undefined {
  const reference = parseConfigValueReference(config);
  if (reference.type !== "template") {
    return undefined;
  }
  const only = reference.parts[0];
  return reference.parts.length === 1 && only?.type === "env" ? only.name : undefined;
}

export function getConfigValueEnvVarNames(config: string): string[] {
  const reference = parseConfigValueReference(config);
  return reference.type === "template" ? getTemplateEnvVarNames(reference.parts) : [];
}

export function getMissingConfigValueEnvVarNames(config: string, env?: Record<string, string>): string[] {
  return getConfigValueEnvVarNames(config).filter((name) => resolveEnvConfigValue(name, env) === undefined);
}

export function isCommandConfigValue(config: string): boolean {
  return parseConfigValueReference(config).type === "command";
}

export function isConfigValueConfigured(config: string, env?: Record<string, string>): boolean {
  return getMissingConfigValueEnvVarNames(config, env).length === 0;
}

export function resolveConfigValue(config: string, env?: Record<string, string>): string | undefined {
  const reference = parseConfigValueReference(config);
  if (reference.type === "command") {
    return undefined;
  }
  return resolveTemplate(reference.parts, env);
}

export function resolveConfigValueUncached(config: string, env?: Record<string, string>): string | undefined {
  return resolveConfigValue(config, env);
}

export function resolveConfigValueOrThrow(config: string, description: string, env?: Record<string, string>): string {
  const resolvedValue = resolveConfigValueUncached(config, env);
  if (resolvedValue !== undefined) {
    return resolvedValue;
  }
  const reference = parseConfigValueReference(config);
  if (reference.type === "command") {
    throw new Error(
      `Pidian does not run shell commands to resolve ${description}. Enter the API key in Pidian settings.`,
    );
  }
  if (reference.type === "template") {
    const missingEnvVars = getMissingConfigValueEnvVarNames(config, env);
    if (missingEnvVars.length === 1) {
      throw new Error(`Failed to resolve ${description} from environment variable: ${missingEnvVars[0]}`);
    }
    if (missingEnvVars.length > 1) {
      throw new Error(`Failed to resolve ${description} from environment variables: ${missingEnvVars.join(", ")}`);
    }
  }
  throw new Error(`Failed to resolve ${description}`);
}

export function resolveHeaders(
  headers: Record<string, string> | undefined,
  env?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const resolvedValue = resolveConfigValue(value, env);
    if (resolvedValue) {
      resolved[key] = resolvedValue;
    }
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function resolveHeadersOrThrow(
  headers: Record<string, string> | undefined,
  description: string,
  env?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveConfigValueOrThrow(value, `${description} header "${key}"`, env);
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function clearConfigValueCache(): void {}
