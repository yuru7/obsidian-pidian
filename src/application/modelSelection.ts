import {
  customProviderModels,
  isConfiguredCustomProvider,
  type CustomOpenAIProvider,
} from "../settings/Settings";

export function connectionConfigFingerprint(settings: {
  apiKeys: Record<string, string>;
  oauthCredentials?: Record<string, unknown>;
  customProviders: CustomOpenAIProvider[];
}): string {
  return JSON.stringify({
    apiKeys: settings.apiKeys,
    oauthProviders: Object.keys(settings.oauthCredentials ?? {}).sort(),
    customProviders: settings.customProviders.map((provider) => ({
      id: provider.id,
      baseUrl: provider.baseUrl.trim(),
      models: customProviderModels(provider).map((model) => ({
        id: model.id,
        supportsImages: Boolean(model.supportsImages),
      })),
      apiKey: provider.apiKey,
    })),
  });
}

export function reconcileModelSelection(
  current: { provider: string; model: string },
  customProviders: CustomOpenAIProvider[],
  knownProviderIds: ReadonlySet<string>,
): { provider: string; model: string } {
  if (!current.provider) {
    return { provider: "", model: "" };
  }
  const custom = customProviders.find((item) => item.id === current.provider);
  if (custom) {
    if (!isConfiguredCustomProvider(custom)) {
      return { provider: "", model: "" };
    }
    const modelIds = customProviderModels(custom).map((model) => model.id);
    if (modelIds.includes(current.model)) {
      return { provider: custom.id, model: current.model };
    }
    return { provider: custom.id, model: modelIds[0] ?? "" };
  }
  if (knownProviderIds.has(current.provider)) {
    return { provider: current.provider, model: current.model };
  }
  return { provider: "", model: "" };
}
