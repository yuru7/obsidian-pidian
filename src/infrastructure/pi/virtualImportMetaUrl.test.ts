import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const VIRTUAL_MODULE_PATH = "/pidian-virtual/pi-coding-agent/main.js";

describe("virtual import.meta.url", () => {
  it("rejects a Unix-style virtual File URL on Windows", () => {
    if (process.platform !== "win32") {
      return;
    }
    expect(() => fileURLToPath(`file://${VIRTUAL_MODULE_PATH}`)).toThrow(
      /File URL path must be absolute/,
    );
  });

  it("fileURLToPath and createRequire accept pathToFileURL of the virtual path", () => {
    const url = pathToFileURL(VIRTUAL_MODULE_PATH).href;
    expect(() => fileURLToPath(url)).not.toThrow();
    expect(typeof createRequire(url)("fs").readFileSync).toBe("function");
  });

  it("esbuild banner uses pathToFileURL so Windows fileURLToPath succeeds", () => {
    const config = readFileSync(path.join(process.cwd(), "esbuild.config.mjs"), "utf8");
    expect(config).toContain(`pathToFileURL("${VIRTUAL_MODULE_PATH}")`);
    expect(config).not.toMatch(/import_meta_url = "file:\/\/\/pidian-virtual\//);
  });

  it("aliases Node fs out of the plugin bundle", () => {
    const config = readFileSync(path.join(process.cwd(), "esbuild.config.mjs"), "utf8");
    expect(config).toContain("fs: stubPaths.fs");
    expect(config).toContain('"node:fs": stubPaths.fs');
    expect(config).toContain('"fs/promises": stubPaths.fsPromises');
    expect(config).toContain("require('fs')");
  });
});
