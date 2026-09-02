import type { SubscriptionProvider } from "../domain/agent/SubscriptionAuth";

/**
 * Pidian-enabled Pi subscription providers.
 * Add an entry here to expose another Pi OAuth subscription in Settings.
 */
export const ENABLED_SUBSCRIPTION_PROVIDERS: readonly SubscriptionProvider[] = [
  { id: "openai-codex", name: "OpenAI Codex" },
];

export function isEnabledSubscriptionProvider(providerId: string): boolean {
  return ENABLED_SUBSCRIPTION_PROVIDERS.some((provider) => provider.id === providerId);
}

export function subscriptionProviderIds(): string[] {
  return ENABLED_SUBSCRIPTION_PROVIDERS.map((provider) => provider.id);
}
