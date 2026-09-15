import { describe, expect, it } from "vitest";
import { doneDuration } from "./doneDuration";

describe("doneDuration", () => {
  it("splits rounded seconds into minutes and leftover seconds", () => {
    expect(doneDuration(0)).toEqual({ minutes: 0, seconds: 0 });
    expect(doneDuration(499)).toEqual({ minutes: 0, seconds: 0 });
    expect(doneDuration(500)).toEqual({ minutes: 0, seconds: 1 });
    expect(doneDuration(3000)).toEqual({ minutes: 0, seconds: 3 });
    expect(doneDuration(59_499)).toEqual({ minutes: 0, seconds: 59 });
    expect(doneDuration(59_500)).toEqual({ minutes: 1, seconds: 0 });
    expect(doneDuration(65_000)).toEqual({ minutes: 1, seconds: 5 });
    expect(doneDuration(125_400)).toEqual({ minutes: 2, seconds: 5 });
  });
});
