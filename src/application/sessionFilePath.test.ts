import { describe, expect, it } from "vitest";
import {
  isSessionFilePath,
  newSessionFilePath,
  SESSION_FILE_EXTENSION,
  sessionFileTimestamp,
  sessionIdFromFilePath,
} from "./sessionFilePath";

describe("sessionFilePath", () => {
  it("uses timestamp_id.json.md for newly placed session files", () => {
    expect(SESSION_FILE_EXTENSION).toBe(".json.md");
    expect(sessionFileTimestamp("2026-01-01T00:00:00.000Z")).toBe("2026-01-01T000000.000Z");
    expect(newSessionFilePath({ id: "abc", createdAt: "2026-01-01T00:00:00.000Z" })).toBe(
      "pidian/sessions/2026-01-01T000000.000Z_abc.json.md",
    );
  });

  it("accepts timestamped, id-only, and legacy session files", () => {
    expect(isSessionFilePath("pidian/sessions/2026-01-01T000000.000Z_abc.json.md")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.json.md")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.json")).toBe(true);
    expect(isSessionFilePath("pidian/sessions/abc.md")).toBe(false);
    expect(isSessionFilePath("pidian/sessions/notes.txt")).toBe(false);
  });

  it("extracts the session id from timestamped and legacy names", () => {
    expect(sessionIdFromFilePath("pidian/sessions/2026-01-01T000000.000Z_abc.json.md")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/abc.json.md")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/abc.json")).toBe("abc");
    expect(sessionIdFromFilePath("pidian/sessions/notes.md")).toBeUndefined();
  });
});
