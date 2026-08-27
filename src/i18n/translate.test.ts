import { describe, expect, it } from "vitest";
import { interpolate, lookup, resolveLocale } from "./translate";

describe("resolveLocale", () => {
  it("keeps supported language codes", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("ja")).toBe("ja");
  });

  it("uses the language prefix when the region is unknown", () => {
    expect(resolveLocale("ja-JP")).toBe("ja");
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale("zh")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});

describe("lookup", () => {
  it("returns Japanese strings for ja", () => {
    expect(lookup("ja", "uiSend")).toBe("送信");
  });

  it("interpolates placeholders", () => {
    expect(lookup("en", "noticeError", { error: "timeout" })).toBe("Pidian: timeout");
    expect(lookup("ja", "noticeError", { error: "timeout" })).toBe("Pidian: timeout");
  });

  it("leaves the template unchanged when vars are omitted", () => {
    expect(interpolate("Hello {name}")).toBe("Hello {name}");
  });
});
