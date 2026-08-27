import { describe, expect, it } from "vitest";
import { applyReplacementsToText } from "./replacements";
import { computeRevision } from "./revision";

describe("replacements", () => {
  it("applies a unique replacement", () => {
    const result = applyReplacementsToText("hello world", [{ oldText: "world", newText: "pidian" }]);
    expect(result).toEqual({ ok: true, content: "hello pidian" });
  });

  it("rejects a missing oldText", () => {
    const result = applyReplacementsToText("hello", [{ oldText: "missing", newText: "x" }]);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-unique oldText", () => {
    const result = applyReplacementsToText("one one", [{ oldText: "one", newText: "two" }]);
    expect(result.ok).toBe(false);
  });

  it("inserts into an empty note when oldText is empty", () => {
    const result = applyReplacementsToText("", [{ oldText: "", newText: "aiueo" }]);
    expect(result).toEqual({ ok: true, content: "aiueo" });
  });

  it("rejects empty oldText when the note is not empty", () => {
    const result = applyReplacementsToText("hello", [{ oldText: "", newText: "x" }]);
    expect(result).toEqual({ ok: false, error: "oldText must not be empty." });
  });
});

describe("revision", () => {
  it("changes when content changes", () => {
    expect(computeRevision("a")).not.toBe(computeRevision("b"));
  });
});
