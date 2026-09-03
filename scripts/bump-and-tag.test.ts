import { describe, expect, it } from "vitest";
import { applyVersionsMap } from "./bump-and-tag.mjs";

describe("applyVersionsMap", () => {
  it("replaces the last plugin version when minAppVersion is unchanged", () => {
    expect(applyVersionsMap({ "0.10.0": "1.8.7" }, "0.10.0", "0.11.1", "1.8.7")).toEqual({
      "0.11.1": "1.8.7",
    });
  });

  it("keeps earlier minApp breakpoints and only replaces the last key", () => {
    expect(
      applyVersionsMap({ "0.5.0": "1.7.0", "0.10.0": "1.8.7" }, "0.10.0", "0.11.1", "1.8.7"),
    ).toEqual({
      "0.5.0": "1.7.0",
      "0.11.1": "1.8.7",
    });
  });

  it("keeps the previous version as the last compatible release when minAppVersion changes", () => {
    expect(applyVersionsMap({ "0.11.1": "1.8.7" }, "0.11.1", "0.12.0", "1.9.0")).toEqual({
      "0.11.1": "1.8.7",
      "0.12.0": "1.9.0",
    });
  });

  it("records the unlisted previous version when minAppVersion changes", () => {
    expect(applyVersionsMap({ "0.10.0": "1.8.7" }, "0.11.1", "0.12.0", "1.9.0")).toEqual({
      "0.10.0": "1.8.7",
      "0.11.1": "1.8.7",
      "0.12.0": "1.9.0",
    });
  });

  it("adds the first entry when versions.json is empty", () => {
    expect(applyVersionsMap({}, "0.10.0", "0.11.1", "1.8.7")).toEqual({
      "0.11.1": "1.8.7",
    });
  });
});
