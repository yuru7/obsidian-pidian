import { describe, expect, it } from "vitest";
import type { SubscriptionLoginEvent, SubscriptionLoginPrompt } from "../../domain/agent/SubscriptionAuth";
import { preferredOAuthSelectId, toPiAuthInteraction } from "./subscriptionLogin";

describe("preferredOAuthSelectId", () => {
  it("picks browser login when Pi offers it", () => {
    expect(preferredOAuthSelectId([{ id: "browser" }, { id: "device_code" }])).toBe("browser");
    expect(preferredOAuthSelectId([{ id: "device_code" }])).toBeUndefined();
  });
});

describe("toPiAuthInteraction", () => {
  it("answers a browser select without prompting the UI", async () => {
    const prompts: SubscriptionLoginPrompt[] = [];
    const interaction = toPiAuthInteraction({
      prompt: async (prompt) => {
        prompts.push(prompt);
        return "nope";
      },
      notify: () => undefined,
    });

    await expect(
      interaction.prompt({
        type: "select",
        message: "Select OpenAI Codex login method:",
        options: [
          { id: "browser", label: "Browser login (default)" },
          { id: "device_code", label: "Device code login (headless)" },
        ],
      }),
    ).resolves.toBe("browser");
    expect(prompts).toEqual([]);
  });

  it("forwards other prompts and notify events", async () => {
    const events: SubscriptionLoginEvent[] = [];
    const interaction = toPiAuthInteraction({
      prompt: async (prompt) => {
        expect(prompt).toEqual({
          type: "manual_code",
          message: "Paste the code",
          placeholder: "http://localhost",
          signal: undefined,
        });
        return "pasted";
      },
      notify: (event) => events.push(event),
    });

    await expect(
      interaction.prompt({
        type: "manual_code",
        message: "Paste the code",
        placeholder: "http://localhost",
      }),
    ).resolves.toBe("pasted");
    interaction.notify({
      type: "device_code",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.openai.com/codex/device",
    });
    expect(events).toEqual([
      {
        type: "device_code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
        intervalSeconds: undefined,
        expiresInSeconds: undefined,
      },
    ]);
  });
});
