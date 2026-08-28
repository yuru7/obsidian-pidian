import { describe, expect, it } from "vitest";
import { BlockedUrlError, InvalidUrlError } from "../../domain/fetch/FetchErrors";
import { isBlockedAddress, SsrfGuard } from "./ssrfGuard";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it("allows a public address", () => {
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
});

describe("SsrfGuard", () => {
  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.0.1/",
    "http://169.254.169.254/",
    "http://[::1]/",
  ])("rejects %s without DNS", async (url) => {
    const guard = new SsrfGuard(async () => {
      throw new Error("dns should not run");
    });
    await expect(guard.assertSafe(url)).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("rejects a public hostname that resolves to a private IP", async () => {
    const guard = new SsrfGuard(async () => [{ address: "127.0.0.1", family: 4 }]);
    await expect(guard.assertSafe("https://example.com/")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("allows a hostname that resolves to a public IP", async () => {
    const guard = new SsrfGuard(async () => [{ address: "8.8.8.8", family: 4 }]);
    const url = await guard.assertSafe("https://example.com/path");
    expect(url.href).toBe("https://example.com/path");
  });

  it("rejects non-http URLs", async () => {
    const guard = new SsrfGuard(async () => []);
    await expect(guard.assertSafe("file:///etc/passwd")).rejects.toBeInstanceOf(InvalidUrlError);
    await expect(guard.assertSafe("not a url")).rejects.toBeInstanceOf(InvalidUrlError);
  });
});
