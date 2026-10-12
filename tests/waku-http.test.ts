import { describe, expect, it } from "vitest";
import {
  COOKIE_STORE,
  ICookieStore,
  IHttpRequestContext,
  REQUEST_CONTEXT,
  registerWakuHttp,
  runWithWakuRequest,
  WakuCookieStore,
  WakuRedirect,
  WakuRequestContext,
} from "../src/http/index.js";
import { app, container } from "../src/ioc/index.js";

describe("Waku HTTP Adapters", () => {
  it("WakuRequestContext reads headers from explicit request", async () => {
    const req = new Request("http://localhost:3000", {
      headers: { "x-custom-header": "test-value", "accept-language": "pl-PL" },
    });
    const ctx = new WakuRequestContext(req);

    expect(await ctx.getHeader("x-custom-header")).toBe("test-value");
    expect(await ctx.getHeader("accept-language")).toBe("pl-PL");
    expect(await ctx.getHeader("non-existing")).toBeNull();
  });

  it("WakuRequestContext reads headers from AsyncLocalStorage store", async () => {
    const req = new Request("http://localhost:3000", {
      headers: { "x-ambient": "ambient-123" },
    });
    const ctx = new WakuRequestContext();

    const result = await runWithWakuRequest({ request: req }, async () => {
      return await ctx.getHeader("x-ambient");
    });

    expect(result).toBe("ambient-123");
    // Outside store should return null
    expect(await ctx.getHeader("x-ambient")).toBeNull();
  });

  it("WakuRequestContext throws WakuRedirect on redirect", () => {
    const ctx = new WakuRequestContext();
    expect(() => ctx.redirect("/login")).toThrowError(WakuRedirect);

    try {
      ctx.redirect("/dashboard");
    } catch (err: any) {
      expect(err).toBeInstanceOf(WakuRedirect);
      expect(err.location).toBe("/dashboard");
      expect(err.status).toBe(302);
      expect(err.response.headers.get("Location")).toBe("/dashboard");
      expect(err.response.status).toBe(302);
    }
  });

  it("WakuCookieStore gets cookies from request header", async () => {
    const req = new Request("http://localhost:3000", {
      headers: { cookie: "session_id=abc123xyz; theme=dark; user=%C5%82ukasz" },
    });
    const store = new WakuCookieStore(req);

    expect(await store.get("session_id")).toBe("abc123xyz");
    expect(await store.get("theme")).toBe("dark");
    expect(await store.get("user")).toBe("łukasz");
    expect(await store.get("missing")).toBeNull();
  });

  it("WakuCookieStore sets and deletes cookies on responseHeaders", async () => {
    const req = new Request("http://localhost:3000");
    const resHeaders = new Headers();
    const store = new WakuCookieStore(req, resHeaders);

    await store.set("token", "secret", {
      path: "/app",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    const setCookies = resHeaders.getSetCookie?.() ?? [
      resHeaders.get("Set-Cookie")!,
    ];
    expect(setCookies.some((c) => c.includes("token=secret"))).toBe(true);
    expect(setCookies.some((c) => c.includes("Path=/app"))).toBe(true);
    expect(setCookies.some((c) => c.includes("HttpOnly"))).toBe(true);
    expect(setCookies.some((c) => c.includes("Secure"))).toBe(true);
    expect(setCookies.some((c) => c.includes("SameSite=Lax"))).toBe(true);

    await store.delete("token");
    const updated = resHeaders.getSetCookie?.() ?? [
      resHeaders.get("Set-Cookie")!,
    ];
    expect(
      updated.some((c) => c.includes("token=") && c.includes("Max-Age=0")),
    ).toBe(true);
  });

  it("WakuCookieStore works with runWithWakuRequest ambient store", async () => {
    const req = new Request("http://localhost:3000", {
      headers: { cookie: "lang=en" },
    });
    const resHeaders = new Headers();
    const store = new WakuCookieStore();

    await runWithWakuRequest(
      { request: req, responseHeaders: resHeaders },
      async () => {
        expect(await store.get("lang")).toBe("en");
        await store.set("lang", "pl");
      },
    );

    const setCookies = resHeaders.getSetCookie?.() ?? [
      resHeaders.get("Set-Cookie")!,
    ];
    expect(setCookies.some((c) => c.includes("lang=pl"))).toBe(true);
  });

  it("registerWakuHttp binds Waku adapters into IoC container", async () => {
    container.reset();
    registerWakuHttp(container);

    const cookieStore = await app<ICookieStore>(COOKIE_STORE);
    expect(cookieStore).toBeInstanceOf(WakuCookieStore);

    const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
    expect(requestContext).toBeInstanceOf(WakuRequestContext);
  });
});
