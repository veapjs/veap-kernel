import { AsyncLocalStorage } from "node:async_hooks";
import {
  type Container,
  container as defaultContainer,
} from "../ioc/container.js";
import type {
  CookieOptions,
  ICookieStore,
  IHttpRequestContext,
} from "./contracts.js";
import { COOKIE_STORE, REQUEST_CONTEXT } from "./contracts.js";

export interface WakuRequestStore {
  request: Request;
  responseHeaders?: Headers;
}

export const wakuRequestContextStorage =
  new AsyncLocalStorage<WakuRequestStore>();

/**
 * Standard HTTP redirect error thrown by {@link WakuRequestContext}.
 * Contains the target URL, HTTP status code and a standard Web `Response`.
 */
export class WakuRedirect extends Error {
  public readonly status: number;
  public readonly location: string;
  public readonly response: Response;

  constructor(location: string, status = 302) {
    super(`REDIRECT: ${location}`);
    this.name = "WakuRedirect";
    this.location = location;
    this.status = status;
    this.response = new Response(null, {
      status,
      headers: { Location: location },
    });
  }
}

function parseCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = decodeURIComponent(trimmed.slice(0, eqIdx).trim());
      const val = decodeURIComponent(trimmed.slice(eqIdx + 1).trim());
      map.set(key, val);
    }
  }
  return map;
}

function serializeCookie(
  name: string,
  value: string,
  options?: CookieOptions,
): string {
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  str += `; Path=${options?.path ?? "/"}`;
  if (options?.expires) {
    str += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options?.httpOnly) {
    str += "; HttpOnly";
  }
  if (options?.secure) {
    str += "; Secure";
  }
  if (options?.sameSite) {
    const s = options.sameSite;
    str += `; SameSite=${s.charAt(0).toUpperCase() + s.slice(1)}`;
  }
  return str;
}

/**
 * Waku.js & Web Standards cookie store implementing {@link ICookieStore}.
 * Reads cookies from incoming `Request` headers and records outgoing `Set-Cookie`
 * headers onto an optional `responseHeaders` object.
 */
export class WakuCookieStore implements ICookieStore {
  private explicitRequest?: Request;
  private explicitResponseHeaders?: Headers;

  constructor(request?: Request, responseHeaders?: Headers) {
    this.explicitRequest = request;
    this.explicitResponseHeaders = responseHeaders;
  }

  private getRequest(): Request | null {
    return (
      this.explicitRequest ??
      wakuRequestContextStorage.getStore()?.request ??
      null
    );
  }

  private getResponseHeaders(): Headers | null {
    return (
      this.explicitResponseHeaders ??
      wakuRequestContextStorage.getStore()?.responseHeaders ??
      null
    );
  }

  public async get(name: string): Promise<string | null> {
    const req = this.getRequest();
    if (!req) return null;
    const cookieHeader = req.headers.get("cookie");
    const cookies = parseCookies(cookieHeader);
    return cookies.get(name) ?? null;
  }

  public async set(
    name: string,
    value: string,
    options?: CookieOptions,
  ): Promise<void> {
    const resHeaders = this.getResponseHeaders();
    if (!resHeaders) return;
    const cookieString = serializeCookie(name, value, options);
    resHeaders.append("Set-Cookie", cookieString);
  }

  public async delete(name: string): Promise<void> {
    const resHeaders = this.getResponseHeaders();
    if (!resHeaders) return;
    const cookieString = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    resHeaders.append("Set-Cookie", cookieString);
  }
}

/**
 * Waku.js & Web Standards HTTP request context implementing {@link IHttpRequestContext}.
 * Reads headers from the active `Request` and throws {@link WakuRedirect} on redirect.
 */
export class WakuRequestContext implements IHttpRequestContext {
  private explicitRequest?: Request;

  constructor(request?: Request) {
    this.explicitRequest = request;
  }

  private getRequest(): Request | null {
    return (
      this.explicitRequest ??
      wakuRequestContextStorage.getStore()?.request ??
      null
    );
  }

  public async getHeader(name: string): Promise<string | null> {
    const req = this.getRequest();
    if (!req) return null;
    return req.headers.get(name);
  }

  public redirect(url: string): never {
    throw new WakuRedirect(url);
  }
}

/**
 * Runs a function within an asynchronous context backed by a Waku `Request` and optional `responseHeaders`.
 */
export async function runWithWakuRequest<T>(
  store: WakuRequestStore,
  fn: () => T | Promise<T>,
): Promise<T> {
  return wakuRequestContextStorage.run(store, async () => fn());
}

/**
 * Binds Waku HTTP adapters into the IoC container.
 */
export function registerWakuHttp(
  containerInstance: Container = defaultContainer,
): void {
  containerInstance.register({
    token: COOKIE_STORE,
    useClass: WakuCookieStore,
    singleton: true,
  });
  containerInstance.register({
    token: REQUEST_CONTEXT,
    useClass: WakuRequestContext,
    singleton: true,
  });
}
