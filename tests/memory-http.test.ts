import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors/app-error.js";
import {
  MemoryCookieStore,
  MemoryRequestContext,
} from "../src/http/memory-http.js";

describe("MemoryCookieStore", () => {
  it("stores, retrieves and deletes cookies", async () => {
    const store = new MemoryCookieStore();

    expect(await store.get("session_token")).toBeNull();

    await store.set("session_token", "secret-value");
    expect(await store.get("session_token")).toBe("secret-value");

    await store.delete("session_token");
    expect(await store.get("session_token")).toBeNull();
  });
});

describe("MemoryRequestContext", () => {
  it("stores and retrieves headers case-insensitively", async () => {
    const ctx = new MemoryRequestContext();

    expect(await ctx.getHeader("authorization")).toBeNull();

    ctx.setHeader("X-Custom-Auth", "Bearer token-123");

    expect(await ctx.getHeader("x-custom-auth")).toBe("Bearer token-123");
    expect(await ctx.getHeader("X-CUSTOM-AUTH")).toBe("Bearer token-123");
  });

  it("throws AppError on redirect", () => {
    const ctx = new MemoryRequestContext();

    expect(() => ctx.redirect("/login")).toThrow(AppError);
    expect(() => ctx.redirect("/login")).toThrow("Redirect to: /login");
  });
});
