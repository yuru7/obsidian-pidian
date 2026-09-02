import type { AuthEvent, AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import type { SubscriptionLoginEvent, SubscriptionLoginInteraction, SubscriptionLoginPrompt } from "../../domain/agent/SubscriptionAuth";

const BROWSER_LOGIN_OPTION_ID = "browser";

export function preferredOAuthSelectId(options: readonly { id: string }[]): string | undefined {
  return options.find((option) => option.id === BROWSER_LOGIN_OPTION_ID)?.id;
}

export function toPiAuthInteraction(interaction: SubscriptionLoginInteraction): AuthInteraction {
  return {
    signal: interaction.signal,
    async prompt(prompt: AuthPrompt): Promise<string> {
      if (prompt.type === "select") {
        const preferred = preferredOAuthSelectId(prompt.options);
        if (preferred) {
          return preferred;
        }
      }
      return interaction.prompt(mapPrompt(prompt));
    },
    notify(event: AuthEvent): void {
      interaction.notify(mapEvent(event));
    },
  };
}

function mapPrompt(prompt: AuthPrompt): SubscriptionLoginPrompt {
  if (prompt.type === "select") {
    return {
      type: "select",
      message: prompt.message,
      options: prompt.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
      })),
      signal: prompt.signal,
    };
  }
  return {
    type: prompt.type,
    message: prompt.message,
    placeholder: prompt.placeholder,
    signal: prompt.signal,
  };
}

function mapEvent(event: AuthEvent): SubscriptionLoginEvent {
  if (event.type === "auth_url") {
    return { type: "auth_url", url: event.url, instructions: event.instructions };
  }
  if (event.type === "device_code") {
    return {
      type: "device_code",
      userCode: event.userCode,
      verificationUri: event.verificationUri,
      intervalSeconds: event.intervalSeconds,
      expiresInSeconds: event.expiresInSeconds,
    };
  }
  return { type: event.type, message: event.message };
}
