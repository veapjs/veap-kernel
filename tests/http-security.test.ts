import { describe, expect, it } from "vitest";
import { verifySameOrigin } from "../src/http/security.js";

describe("verifySameOrigin", () => {
  it("allows safe HTTP methods unconditionally", () => {
    expect(verifySameOrigin({ method: "GET", headers: new Headers() })).toBe(
      true,
    );
    expect(verifySameOrigin({ method: "HEAD", headers: new Headers() })).toBe(
      true,
    );
    expect(
      verifySameOrigin({ method: "OPTIONS", headers: new Headers() }),
    ).toBe(true);
    expect(verifySameOrigin({ headers: new Headers() })).toBe(true);
  });

  it("rejects cross-site fetch requests via Sec-Fetch-Site", () => {
    const headers = new Headers();
    headers.set("sec-fetch-site", "cross-site");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(false);
  });

  it("allows same-origin requests matching Host header", () => {
    const headers = new Headers();
    headers.set("origin", "https://veap.dev");
    headers.set("host", "veap.dev");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(true);
  });

  it("rejects requests where Origin differs from Host", () => {
    const headers = new Headers();
    headers.set("origin", "https://malicious-site.com");
    headers.set("host", "veap.dev");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(false);
  });

  it("handles case-insensitive hostnames and ports", () => {
    const headers = new Headers();
    headers.set("origin", "https://VEAP.DEV:3000");
    headers.set("host", "veap.dev:3000");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(true);
  });

  it("correctly extracts the first host from multi-proxy x-forwarded-host header", () => {
    const headers = new Headers();
    headers.set("origin", "https://app.veap.dev");
    headers.set("x-forwarded-host", "app.veap.dev, internal-lb.corp:8080");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(true);
  });

  it("rejects spoofed multi-proxy x-forwarded-host header", () => {
    const headers = new Headers();
    headers.set("origin", "https://evil.com");
    headers.set("x-forwarded-host", "app.veap.dev, internal-lb.corp:8080");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(false);
  });

  it("rejects malformed origin URLs", () => {
    const headers = new Headers();
    headers.set("origin", "not-a-valid-url");
    headers.set("host", "veap.dev");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(false);
  });

  it("allows requests without origin header (direct/internal navigation)", () => {
    const headers = new Headers();
    headers.set("host", "veap.dev");

    expect(verifySameOrigin({ method: "POST", headers })).toBe(true);
  });
});
