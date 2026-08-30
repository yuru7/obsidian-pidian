import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as fs from "./fs";
import * as fsPromises from "./fs-promises";

describe("fs stub", () => {
  it("treats every path as missing", () => {
    expect(fs.existsSync("/tmp/anything")).toBe(false);
  });

  it("rejects reads with ENOENT", () => {
    expect(() => fs.readFileSync("/tmp/secret")).toThrowError(/does not access the filesystem/);
    try {
      fs.readFileSync("/tmp/secret");
    } catch (error) {
      expect(error).toMatchObject({ code: "ENOENT" });
    }
  });

  it("invokes callback-style APIs with ENOENT", async () => {
    const error = await new Promise<Error>((resolve) => {
      fs.stat("/tmp/secret", (err: Error | null) => {
        resolve(err ?? new Error("missing error"));
      });
    });
    expect(error).toMatchObject({ code: "ENOENT" });
  });

  it("rejects fs/promises reads with ENOENT", async () => {
    await expect(fsPromises.readFile("/tmp/secret")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.promises.readFile("/tmp/secret")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("Pi keeps credentials off the home directory", () => {
  it("creates the model runtime with in-memory auth storage", () => {
    const source = readFileSync(path.join(process.cwd(), "src/infrastructure/pi/PiAgentAdapter.ts"), "utf8");
    expect(source).toContain("new InMemoryCredentialStore()");
  });
});
