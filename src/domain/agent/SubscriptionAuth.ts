export interface SubscriptionProvider {
  id: string;
  name: string;
}

export type SubscriptionLoginPrompt =
  | {
      type: "text" | "secret" | "manual_code";
      message: string;
      placeholder?: string;
      signal?: AbortSignal;
    }
  | {
      type: "select";
      message: string;
      options: readonly { id: string; label: string; description?: string }[];
      signal?: AbortSignal;
    };

export type SubscriptionLoginEvent =
  | { type: "info"; message: string }
  | { type: "progress"; message: string }
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    };

export interface SubscriptionLoginInteraction {
  signal?: AbortSignal;
  prompt(prompt: SubscriptionLoginPrompt): Promise<string>;
  notify(event: SubscriptionLoginEvent): void;
}

export interface SubscriptionAuth {
  listEnabled(): readonly SubscriptionProvider[];
  hasSession(providerId: string): boolean;
  login(providerId: string, interaction: SubscriptionLoginInteraction): Promise<void>;
  logout(providerId: string): Promise<void>;
}
