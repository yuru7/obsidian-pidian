import { describe, expect, it } from "vitest";
import {
  getConfigValueEnvVarName,
  getConfigValueEnvVarNames,
  isCommandConfigValue,
  resolveConfigValue,
  resolveConfigValueOrThrow,
} from "./resolve-config-value";

describe("resolve-config-value stub", () => {
  it("returns literals and interpolates environment variables", () => {
    expect(resolveConfigValue("sk-literal")).toBe("sk-literal");
    expect(resolveConfigValue("$API_KEY", { API_KEY: "from-map" })).toBe("from-map");
    expect(getConfigValueEnvVarName("$OPENAI_API_KEY")).toBe("OPENAI_API_KEY");
    expect(getConfigValueEnvVarNames("prefix-$A-${B}")).toEqual(["A", "B"]);
  });

  it("does not execute shell command credentials", () => {
    expect(isCommandConfigValue("!op read")).toBe(true);
    expect(resolveConfigValue("!op read")).toBeUndefined();
    expect(() => resolveConfigValueOrThrow("!op read", "API key")).toThrow(/does not run shell commands/);
  });
});
