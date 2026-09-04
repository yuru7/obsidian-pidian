import { describe, expect, it } from "vitest";
import { tokenizeSearchText } from "./searchNotesTokenizer";

describe("tokenizeSearchText", () => {
  it("splits latin words and lowercases them", () => {
    expect(tokenizeSearchText("Hello ECS-Notes")).toEqual(["hello", "ecs", "notes"]);
  });

  it("indexes Japanese as overlapping bigrams", () => {
    expect(tokenizeSearchText("東京都")).toEqual(["東京", "京都"]);
    expect(tokenizeSearchText("猫")).toEqual(["猫"]);
  });

  it("keeps latin and CJK tokens from mixed text", () => {
    expect(tokenizeSearchText("AWSの東京")).toEqual(["aws", "の東", "東京"]);
  });
});
