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
});

describe("revision", () => {
  it("changes when content changes", () => {
    expect(computeRevision("a")).not.toBe(computeRevision("b"));
  });
});
