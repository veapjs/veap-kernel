import type { Token } from "../ioc/tokens";

export interface CookieOptions {
  expires?: Date;
  httpOnly?: boolean;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
}

export interface ICookieStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string, options?: CookieOptions): Promise<void>;
  delete(name: string): Promise<void>;
}

export interface IHttpRequestContext {
  getHeader(name: string): Promise<string | null>;
  redirect(url: string): never;
}

export const COOKIE_STORE: Token<ICookieStore> = Symbol.for(
  "veap:kernel:cookie-store",
);

export const REQUEST_CONTEXT: Token<IHttpRequestContext> = Symbol.for(
  "veap:kernel:request-context",
);
