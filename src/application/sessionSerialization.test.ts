import { describe, expect, it } from "vitest";
import { migratePidianSession, parsePidianSession, serializePidianSession } from "./sessionSerialization";
import type { PidianSession } from "../domain/sessions/PidianSession";

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

  it("rejects unknown versions", () => {
    expect(() => migratePidianSession({ ...sample, version: 99 })).toThrow(/Unsupported session version/);
  });
});
