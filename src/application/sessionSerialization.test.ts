import { describe, expect, it } from "vitest";
import { migratePidianSession, parsePidianSession, serializePidianSession } from "./sessionSerialization";
import { sumTokenUsage, type PidianSession } from "../domain/sessions/PidianSession";

const sample: PidianSession = {
  version: 1,
  id: "abc",
  title: "Hello",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  provider: "openai",
  model: "gpt-5",
  messages: [
    {
      id: "m1",
      role: "user",
      text: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("session serialization", () => {
  it("round-trips version 1 sessions", () => {
    const json = serializePidianSession(sample);
    expect(parsePidianSession(JSON.parse(json))).toEqual(sample);
  });

  it("round-trips assistant usage", () => {
    const withUsage: PidianSession = {
      ...sample,
      messages: [
        sample.messages[0]!,
        {
          id: "m2",
          role: "assistant",
          text: "Hi",
          usage: { input: 12, output: 3 },
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    };
    const json = serializePidianSession(withUsage);
    expect(parsePidianSession(JSON.parse(json))).toEqual(withUsage);
  });

  it("sums token usage across messages", () => {
    expect(
      sumTokenUsage([
        { id: "u", role: "user", text: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
        {
          id: "a1",
          role: "assistant",
          text: "A",
          usage: { input: 10, output: 4 },
          createdAt: "2026-01-01T00:00:01.000Z",
        },
        {
          id: "a2",
          role: "assistant",
          text: "B",
          usage: { input: 2, output: 1 },
          createdAt: "2026-01-01T00:00:02.000Z",
        },
      ]),
    ).toEqual({ input: 12, output: 5 });
  });

  it("rejects unknown versions", () => {
    expect(() => migratePidianSession({ ...sample, version: 99 })).toThrow(/Unsupported session version/);
  });
});
