import { describe, expect, it } from "vitest";
import {
  isSessionFilePath,
  newSessionFilePath,
  SESSION_FILE_EXTENSION,
  sessionFileTimestamp,
  sessionIdFromFilePath,
} from "./sessionFilePath";

describe("sessionFilePath", () => {
  it("uses timestamp_id.jsonl for newly placed session files", () => {
    expect(sessionFileTimestamp("2026-01-01T00:00:00.000Z")).toBe("2026-01-01T000000.000Z");
    expect(newSessionFilePath({ id: "abc", createdAt: "2026-01-01T00:00:00.000Z" })).toBe(
      "pidian/sessions/2026-01-01T000000.000Z_abc.jsonl",
    );
  });

  it("uses timestamp_id.jsonl.md when the jsonl.md format is selected", () => {
    expect(SESSION_FILE_EXTENSION).toBe(".jsonl.md");
    expect(newSessionFilePath({ id: "abc", createdAt: "2026-01-01T00:00:00.000Z" }, "jsonl.md")).toBe(
      "pidian/sessions/2026-01-01T000000.000Z_abc.jsonl.md",
    );
  });

  it("places session files under a custom plugin directory", () => {
    expect(newSessionFilePath({ id: "abc", createdAt: "2026-01-01T00:00:00.000Z" }, "jsonl.md", "agent-data")).toBe(
      "agent-data/sessions/2026-01-01T000000.000Z_abc.jsonl.md",
    );
  });

  it("accepts timestamped, id-only, jsonl, and legacy json session files", () => {
    expect(isSessionFilePath("pidian/sessions/2026-01-01T000000.000Z_abc.jsonl.md")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.jsonl.md")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.jsonl")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.json.md")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.json")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.md")).toBe(false);
    expect(isSessionFilePath("pidian/sessions/notes.txt")).toBe(false);
  });

  it("extracts the session id from timestamped and legacy names", () => {
    expect(sessionIdFromFilePath("pidian/sessions/2026-01-01T000000.000Z_abc.jsonl.md")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/abc.jsonl.md")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/abc.jsonl")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/abc.json.md")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/abc.json")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/notes.md")).toBeUndefined();
  });
});
