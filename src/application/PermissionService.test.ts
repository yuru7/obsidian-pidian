import { describe, expect, it, vi } from "vitest";
import { PermissionService } from "./PermissionService";

describe("PermissionService", () => {
  it("allows immediately when set to allow", async () => {
    const confirm = vi.fn();
    const service = new PermissionService(() => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }), {
      confirm,
    });
    await expect(
      service.authorize({ category: "read", toolName: "read_note", summary: "Read a.md" }),
    ).resolves.toEqual({ allowed: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("denies immediately when set to deny", async () => {
    const confirm = vi.fn();
    const service = new PermissionService(() => ({ read: "allow", create: "deny", edit: "deny", delete: "deny", webSearch: "deny" }), {
      confirm,
    });
    const decision = await service.authorize({
      category: "edit",
      toolName: "edit_markdown",
      summary: "Edit a.md",
    });
    expect(decision.allowed).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks the user and reports a denial", async () => {
    const service = new PermissionService(() => ({ read: "allow", create: "ask", edit: "ask", delete: "deny", webSearch: "deny" }), {
      confirm: async () => false,
    });
    const decision = await service.authorize({
      category: "create",
      toolName: "create_note",
      summary: "Create b.md",
    });
    expect(decision).toEqual({ allowed: false, reason: "Tool execution denied by user" });
  });

  it("asks the user and allows when confirmed", async () => {
    const confirm = vi.fn(async () => true);
    const service = new PermissionService(() => ({ read: "ask", create: "ask", edit: "ask", delete: "ask", webSearch: "deny" }), {
      confirm,
    });
    await expect(
      service.authorize({ category: "read", toolName: "read_note", summary: "Read a.md" }),
    ).resolves.toEqual({ allowed: true });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("denies web search when set to deny", async () => {
    const confirm = vi.fn();
    const service = new PermissionService(
      () => ({ read: "allow", create: "allow", edit: "allow", delete: "allow", webSearch: "deny" }),
      { confirm },
    );
    const decision = await service.authorize({
      category: "webSearch",
      toolName: "web_search",
      summary: 'Search the web for "Pi"',
    });
    expect(decision.allowed).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});
