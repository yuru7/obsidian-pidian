export type CredentialSource = "settings" | "env" | "oauth" | "none";

export type CredentialResolution =
  | { source: "settings"; apiKey: string }
  | { source: "env"; apiKey: string }
  | { source: "oauth" }
  | { source: "none" };

export type CredentialRuntimePlan =
  | { action: "set"; apiKey: string }
  | { action: "oauth" }
  | { action: "clear" };

export interface CredentialInputs {
  getSetting(providerId: string): string | undefined;
  getEnv(providerId: string): string | undefined;
  getOAuth?(providerId: string): boolean;
}

function normalizeKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export class CredentialResolver {
  constructor(private readonly inputs: CredentialInputs) {}

  resolve(providerId: string): CredentialResolution {
    const setting = normalizeKey(this.inputs.getSetting(providerId));
    if (setting) {
      return { source: "settings", apiKey: setting };
    }

    if (this.inputs.getOAuth?.(providerId)) {
      return { source: "oauth" };
    }

    const env = normalizeKey(this.inputs.getEnv(providerId));
    if (env) {
      return { source: "env", apiKey: env };
    }

    return { source: "none" };
  }

  hasCredential(providerId: string): boolean {
    return this.resolve(providerId).source !== "none";
  }
}

export function credentialRuntimePlan(
  resolved: CredentialResolution,
  customApiKey?: string,
): CredentialRuntimePlan {
  if (resolved.source === "settings" || resolved.source === "env") {
    return { action: "set", apiKey: resolved.apiKey };
  }
  if (resolved.source === "oauth") {
    return { action: "oauth" };
  }
  const custom = normalizeKey(customApiKey);
  if (custom) {
    return { action: "set", apiKey: custom };
  }
  return { action: "clear" };
}
