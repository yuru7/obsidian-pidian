import { describe, expect, it } from "vitest";
import {
  migratePidianSession,
  parsePidianSession,
  parseSessionFile,
  parseSessionSummary,
  serializePidianSession,
  serializeSessionFile,
} from "./sessionSerialization";
import { sumTokenUsage, toSessionSummary, SESSION_SUMMARY_QUERY_MAX_LENGTH, type PidianSession } from "../domain/sessions/PidianSession";

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
    expect(parseSessionFile(serializePidianSession(sample))).toEqual(sample);
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
          usage: { input: 12, output: 3, cacheRead: 8, cacheWrite: 4 },
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    };
    expect(parseSessionFile(serializePidianSession(withUsage))).toEqual(withUsage);
  });

  it("sums token usage across messages", () => {
    expect(
      sumTokenUsage([
        { id: "u", role: "user", text: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
        {
          id: "a1",
          role: "assistant",
          text: "A",
          usage: { input: 10, output: 4, cacheRead: 6, cacheWrite: 2 },
          createdAt: "2026-01-01T00:00:01.000Z",
        },
        {
          id: "a2",
          role: "assistant",
          text: "B",
          usage: { input: 2, output: 1, cacheRead: 1, cacheWrite: 3 },
          createdAt: "2026-01-01T00:00:02.000Z",
        },
      ]),
    ).toEqual({ input: 12, output: 5, cacheRead: 7, cacheWrite: 5 });
  });

  it("defaults missing cache usage to zero", () => {
    const parsed = parsePidianSession({
      ...sample,
      messages: [
        sample.messages[0],
        {
          id: "m2",
          role: "assistant",
          text: "Hi",
          usage: { input: 12, output: 3 },
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    });
    expect(parsed.messages[1]?.usage).toEqual({
      input: 12,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("round-trips user message context", () => {
    const withContext: PidianSession = {
      ...sample,
      messages: [
        {
          id: "m1",
          role: "user",
          text: "Hello",
          context: { notePath: "notes/example.md", startLine: 12, endLine: 15 },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(parseSessionFile(serializePidianSession(withContext))).toEqual(withContext);
  });

  it("round-trips user message context without a line range", () => {
    const withContext: PidianSession = {
      ...sample,
      messages: [
        {
          id: "m1",
          role: "user",
          text: "Hello",
          context: { notePath: "maps/board.canvas" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(parseSessionFile(serializePidianSession(withContext))).toEqual(withContext);
  });

  it("omits invalid user message context", () => {
    expect(
      parsePidianSession({
        ...sample,
        messages: [
          {
            id: "m1",
            role: "user",
            text: "Hello",
            context: { notePath: "notes/example.md", startLine: 0, endLine: 1 },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }).messages[0]?.context,
    ).toBeUndefined();
    expect(
      parsePidianSession({
        ...sample,
        messages: [
          {
            id: "m1",
            role: "user",
            text: "Hello",
            context: { notePath: "", startLine: 1, endLine: 1 },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }).messages[0]?.context,
    ).toBeUndefined();
    expect(
      parsePidianSession({
        ...sample,
        messages: [
          {
            id: "m1",
            role: "assistant",
            text: "Hi",
            context: { notePath: "notes/example.md", startLine: 1, endLine: 1 },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }).messages[0]?.context,
    ).toBeUndefined();
  });

  it("round-trips thinkingLevel", () => {
    const withThinking: PidianSession = { ...sample, thinkingLevel: "high" };
    expect(parseSessionFile(serializePidianSession(withThinking))).toEqual(withThinking);
  });

  it("round-trips forked sessions", () => {
    const forked: PidianSession = { ...sample, forkedMessageCount: 1 };
    expect(parseSessionFile(serializePidianSession(forked))).toEqual(forked);
  });

  it("round-trips compaction checkpoints", () => {
    const compacted: PidianSession = {
      ...sample,
      messages: [
        sample.messages[0]!,
        { id: "m2", role: "assistant", text: "Hi", createdAt: "2026-01-01T00:00:01.000Z" },
      ],
      compaction: {
        summary: "## Goal\nGreet",
        firstKeptMessageId: "m2",
        createdAt: "2026-01-01T00:00:02.000Z",
        tokensBefore: 32000,
      },
    };
    expect(parseSessionFile(serializePidianSession(compacted))).toEqual(compacted);
  });

  it("omits invalid compaction checkpoints", () => {
    expect(parsePidianSession({ ...sample, compaction: { summary: "" } }).compaction).toBeUndefined();
    expect(
      parsePidianSession({
        ...sample,
        compaction: {
          summary: "## Goal",
          firstKeptMessageId: "missing",
          createdAt: "2026-01-01T00:00:02.000Z",
        },
      }).compaction,
    ).toBeUndefined();
  });

  it("round-trips assistant content blocks", () => {
    const withBlocks: PidianSession = {
      ...sample,
      messages: [
        sample.messages[0]!,
        {
          id: "m2",
          role: "assistant",
          text: "I'll look. Done.",
          thinking: "planmore",
          toolCalls: [{ id: "1", name: "read_note", args: {}, result: "ok", isError: false }],
          workedMs: 1000,
          blocks: [
            {
              type: "work",
              thinking: "plan",
              workedMs: 1000,
              startedAt: "2026-01-01T00:00:01.000Z",
            },
            { type: "text", text: "I'll look." },
            {
              type: "work",
              thinking: "more",
              toolCalls: [{ id: "1", name: "read_note", args: {}, result: "ok", isError: false }],
              workedMs: 4000,
              startedAt: "2026-01-01T00:00:02.000Z",
            },
            { type: "text", text: " Done." },
          ],
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    };
    expect(parseSessionFile(serializePidianSession(withBlocks))).toEqual(withBlocks);
  });

  it("round-trips assistant workedMs", () => {
    const withWork: PidianSession = {
      ...sample,
      messages: [
        sample.messages[0]!,
        {
          id: "m2",
          role: "assistant",
          text: "Hi",
          workedMs: 8320,
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    };
    expect(parseSessionFile(serializePidianSession(withWork))).toEqual(withWork);
  });

  it("omits invalid workedMs values", () => {
    expect(
      parsePidianSession({
        ...sample,
        messages: [
          {
            id: "m2",
            role: "assistant",
            text: "Hi",
            workedMs: -1,
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      }).messages[0]?.workedMs,
    ).toBeUndefined();
  });

  it("omits invalid forkedMessageCount values", () => {
    expect(parsePidianSession({ ...sample, forkedMessageCount: 0 }).forkedMessageCount).toBeUndefined();
    expect(parsePidianSession({ ...sample, forkedMessageCount: 1.5 }).forkedMessageCount).toBeUndefined();
    expect(parsePidianSession(sample).forkedMessageCount).toBeUndefined();
  });

  it("ignores unknown thinkingLevel values", () => {
    expect(parsePidianSession({ ...sample, thinkingLevel: "nope" }).thinkingLevel).toBeUndefined();
  });

  it("rejects unknown versions", () => {
    expect(() => migratePidianSession({ ...sample, version: 99 })).toThrow(/Unsupported session version/);
  });

  it("serializes compact jsonl without pretty-print whitespace", () => {
    const jsonl = serializePidianSession(sample);
    expect(jsonl).toBe(
      [
        '{"version":1,"id":"abc","title":"Hello","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z","provider":"openai","model":"gpt-5"}',
        '{"id":"m1","role":"user","text":"Hello","createdAt":"2026-01-01T00:00:00.000Z"}',
      ].join("\n"),
    );
    expect(jsonl.includes("\n  ")).toBe(false);
  });

  it("wraps .jsonl.md sessions in a json code fence", () => {
    const jsonl = serializePidianSession(sample);
    expect(serializeSessionFile(sample, true)).toBe("```json\n" + jsonl + "\n```\n");
    expect(parseSessionFile(serializeSessionFile(sample, true))).toEqual(sample);
  });

  it("reads fenced json.md, jsonl fence, raw jsonl, and legacy json session files", () => {
    const jsonl = serializePidianSession(sample);
    const legacyJson = JSON.stringify(sample, null, 2);
    expect(parseSessionFile("```json\n" + jsonl + "\n```")).toEqual(sample);
    expect(parseSessionFile("```jsonl\n" + jsonl + "\n```")).toEqual(sample);
    expect(parseSessionFile(jsonl)).toEqual(sample);
    expect(parseSessionFile("```json\n" + legacyJson + "\n```")).toEqual(sample);
    expect(parseSessionFile(legacyJson)).toEqual(sample);
    expect(serializeSessionFile(sample, false)).toBe(jsonl);
  });

  it("summarizes jsonl, fenced jsonl, and legacy json sessions", () => {
    const expected = toSessionSummary(sample);
    const jsonl = serializePidianSession(sample);
    expect(parseSessionSummary(jsonl)).toEqual(expected);
    expect(parseSessionSummary(serializeSessionFile(sample, true))).toEqual(expected);
    expect(parseSessionSummary(JSON.stringify(sample, null, 2))).toEqual(expected);
    expect(parseSessionSummary(JSON.stringify(sample))).toEqual(expected);
  });

  it("stops jsonl summary parsing after the first user message", () => {
    const jsonl = [
      '{"version":1,"id":"abc","title":"Hello","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z","provider":"openai","model":"gpt-5"}',
      '{"id":"a1","role":"assistant","text":"ignored","createdAt":"2026-01-01T00:00:00.000Z"}',
      '{"id":"m1","role":"user","text":"First question","createdAt":"2026-01-01T00:00:01.000Z"}',
      "{not json",
    ].join("\n");
    expect(parseSessionSummary(jsonl)).toEqual({
      id: "abc",
      title: "Hello",
      updatedAt: "2026-01-02T00:00:00.000Z",
      provider: "openai",
      model: "gpt-5",
      firstQuery: "First question",
    });
    expect(() => parseSessionFile(jsonl)).toThrow();
  });

  it("summarizes a header-only jsonl session and ignores a closing fence", () => {
    const jsonl = '{"version":1,"id":"abc","title":"Hello","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z","provider":"openai","model":"gpt-5"}';
    expect(parseSessionSummary("```json\n" + jsonl + "\n```\n")).toEqual({
      id: "abc",
      title: "Hello",
      updatedAt: "2026-01-02T00:00:00.000Z",
      provider: "openai",
      model: "gpt-5",
      firstQuery: "",
    });
  });

  it("rejects unknown versions when summarizing", () => {
    expect(() => parseSessionSummary(JSON.stringify({ ...sample, version: 99 }))).toThrow(/Unsupported session version/);
  });

  it("clips a long first query when summarizing", () => {
    const text = `${"a".repeat(SESSION_SUMMARY_QUERY_MAX_LENGTH)}Z`;
    const jsonl = [
      '{"version":1,"id":"abc","title":"Hello","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z","provider":"openai","model":"gpt-5"}',
      JSON.stringify({ id: "m1", role: "user", text, createdAt: "2026-01-01T00:00:00.000Z" }),
    ].join("\n");
    expect(parseSessionSummary(jsonl).firstQuery).toBe(`${"a".repeat(SESSION_SUMMARY_QUERY_MAX_LENGTH)}…`);
  });
});
