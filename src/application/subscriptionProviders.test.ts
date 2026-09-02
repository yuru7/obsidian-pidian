import { describe, expect, it } from "vitest";
import {
  ENABLED_SUBSCRIPTION_PROVIDERS,
  isEnabledSubscriptionProvider,
  subscriptionProviderIds,
} from "./subscriptionProviders";

describe("subscriptionProviders", () => {
  it("enables OpenAI Codex only for now", () => {
    expect(ENABLED_SUBSCRIPTION_PROVIDERS).toEqual([{ id: "openai-codex", name: "OpenAI Codex" }]);
    expect(subscriptionProviderIds()).toEqual(["openai-codex"]);
    expect(isEnabledSubscriptionProvider("openai-codex")).toBe(true);
    expect(isEnabledSubscriptionProvider("openai")).toBe(false);
    expect(isEnabledSubscriptionProvider("github-copilot")).toBe(false);
  });
});
