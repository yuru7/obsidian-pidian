import { describe, expect, it } from "vitest";
import { toSessionSummary, type PidianSession } from "./PidianSession";

function session(messages: PidianSession["messages"]): PidianSession {
  return {
    version: 1,
    id: "abc",
    title: "Short title",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    provider: "openai",
    model: "gpt-5",
    messages,
  };
}

describe("toSessionSummary", () => {
  it("copies list fields and the first user query", () => {
    expect(
      toSessionSummary(
        session([
          {
            id: "a",
            role: "assistant",
            text: "ignored",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "u",
            role: "user",
            text: "A long first query\nwith two lines",
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ]),
      ),
    ).toEqual({
      id: "abc",
      title: "Short title",
      updatedAt: "2026-01-02T00:00:00.000Z",
      model: "gpt-5",
      provider: "openai",
      firstQuery: "A long first query\nwith two lines",
    });
  });

  it("uses an empty first query when there is no user message", () => {
    expect(toSessionSummary(session([])).firstQuery).toBe("");
  });
});
