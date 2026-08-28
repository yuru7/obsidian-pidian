import { describe, expect, it } from "vitest";
import { PermissionService } from "../application/PermissionService";
import { FetchService } from "../application/fetch/FetchService";
import { SsrfGuard } from "../infrastructure/fetch/ssrfGuard";
import { createFetchUrlTool } from "./FetchUrlTool";

function permissions(webSearch: "allow" | "ask" | "deny") {
  return new PermissionService(
    () => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch }),
    { confirm: async () => true },
  );
}

function toolWith(
  handler: (url: string) => Promise<Response> | Response,
  webSearch: "allow" | "ask" | "deny" = "allow",
) {
  const fetchService = new FetchService(
    async (input) => handler(String(input)),
    new SsrfGuard(async () => [{ address: "8.8.8.8", family: 4 }]),
  );
  return createFetchUrlTool({ permissions: permissions(webSearch), fetchService });
}

describe("fetch_url", () => {
  it("uses webSearch permission and refuses when it is deny", async () => {
    const tool = toolWith(async () => new Response("hello", { headers: { "content-type": "text/plain" } }), "deny");
    const result = await tool.execute({ url: "https://example.com/" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied");
  });

  it("returns formatted page content when allowed", async () => {
    const tool = toolWith(async () => new Response("hello", { headers: { "content-type": "text/plain" } }));
    const result = await tool.execute({ url: "https://example.com/" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe(["URL: https://example.com/", "", "hello"].join("\n"));
  });

  it("rejects a missing url", async () => {
    const tool = toolWith(async () => new Response(""));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content).toBe("url is required.");
  });

  it("blocks a private URL", async () => {
    const fetchService = new FetchService(
      async () => new Response("secret"),
      new SsrfGuard(async () => [{ address: "8.8.8.8", family: 4 }]),
    );
    const tool = createFetchUrlTool({ permissions: permissions("allow"), fetchService });
    const result = await tool.execute({ url: "http://127.0.0.1/" });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("URL is blocked.");
  });
});
