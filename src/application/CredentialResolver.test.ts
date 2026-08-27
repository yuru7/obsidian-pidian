import { describe, expect, it } from "vitest";
import { CredentialResolver } from "./CredentialResolver";

describe("CredentialResolver", () => {
  it("returns Pidian settings over environment variables", () => {
    const resolver = new CredentialResolver({
      getSetting: () => "setting-key",
      getEnv: () => "env-key",
    });
    expect(resolver.resolve("openai")).toEqual({ source: "settings", apiKey: "setting-key" });
  });

  it("treats an empty settings value as unset", () => {
    const resolver = new CredentialResolver({
      getSetting: () => "  ",
      getEnv: () => "env-key",
    });
    expect(resolver.resolve("openai")).toEqual({ source: "env", apiKey: "env-key" });
  });

  it("falls through when neither source has a key", () => {
    const resolver = new CredentialResolver({
      getSetting: () => undefined,
      getEnv: () => undefined,
    });
    expect(resolver.resolve("openai")).toEqual({ source: "none" });
  });
});
