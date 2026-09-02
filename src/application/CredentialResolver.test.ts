import { describe, expect, it } from "vitest";
import { CredentialResolver, credentialRuntimePlan } from "./CredentialResolver";

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

  it("prefers a settings API key over OAuth", () => {
    const resolver = new CredentialResolver({
      getSetting: () => "setting-key",
      getEnv: () => undefined,
      getOAuth: () => true,
    });
    expect(resolver.resolve("anthropic")).toEqual({ source: "settings", apiKey: "setting-key" });
  });

  it("uses OAuth when no API key is set", () => {
    const resolver = new CredentialResolver({
      getSetting: () => undefined,
      getEnv: () => "env-key",
      getOAuth: (id) => id === "openai-codex",
    });
    expect(resolver.resolve("openai-codex")).toEqual({ source: "oauth" });
    expect(resolver.resolve("openai")).toEqual({ source: "env", apiKey: "env-key" });
  });

  it("falls through when neither source has a key", () => {
    const resolver = new CredentialResolver({
      getSetting: () => undefined,
      getEnv: () => undefined,
    });
    expect(resolver.resolve("openai")).toEqual({ source: "none" });
  });

  it("treats settings, env, or OAuth as configured", () => {
    expect(
      new CredentialResolver({
        getSetting: () => "setting-key",
        getEnv: () => undefined,
      }).hasCredential("openai"),
    ).toBe(true);
    expect(
      new CredentialResolver({
        getSetting: () => "  ",
        getEnv: () => "env-key",
      }).hasCredential("openai"),
    ).toBe(true);
    expect(
      new CredentialResolver({
        getSetting: () => undefined,
        getEnv: () => undefined,
        getOAuth: () => true,
      }).hasCredential("openai-codex"),
    ).toBe(true);
    expect(
      new CredentialResolver({
        getSetting: () => undefined,
        getEnv: () => undefined,
      }).hasCredential("openai"),
    ).toBe(false);
  });
});

describe("credentialRuntimePlan", () => {
  it("sets a settings or env API key as a runtime override", () => {
    expect(credentialRuntimePlan({ source: "settings", apiKey: "sk" })).toEqual({
      action: "set",
      apiKey: "sk",
    });
    expect(credentialRuntimePlan({ source: "env", apiKey: "env" })).toEqual({
      action: "set",
      apiKey: "env",
    });
  });

  it("leaves OAuth in the credential store instead of overriding it", () => {
    expect(credentialRuntimePlan({ source: "oauth" }, "custom")).toEqual({ action: "oauth" });
  });

  it("uses a custom provider key when nothing else is set", () => {
    expect(credentialRuntimePlan({ source: "none" }, "local")).toEqual({
      action: "set",
      apiKey: "local",
    });
    expect(credentialRuntimePlan({ source: "none" }, "  ")).toEqual({ action: "clear" });
    expect(credentialRuntimePlan({ source: "none" })).toEqual({ action: "clear" });
  });
});
