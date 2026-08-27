export type CredentialSource = "settings" | "env" | "none";

export type CredentialResolution =
  | { source: "settings"; apiKey: string }
  | { source: "env"; apiKey: string }
  | { source: "none" };

export interface CredentialInputs {
  getSetting(providerId: string): string | undefined;
  getEnv(providerId: string): string | undefined;
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
