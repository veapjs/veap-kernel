import { createRequire } from "node:module";
import type {
  CookieOptions,
  ICookieStore,
  IHttpRequestContext,
} from "./contracts.js";

const require = createRequire(import.meta.url);

/**
 * Next.js `cookies()` adapter for the {@link ICookieStore} port.
 *
 * Thin wrapper over Next.js request-scoped cookie store.
 * Method calls await `cookies()` dynamically to preserve request boundaries
 * and gracefully fall back when cookies are not available.
 */
export class NextCookieStore implements ICookieStore {
  public async get(name: string): Promise<string | null> {
    try {
      // @ts-ignore - Next.js is optional in kernel and resolved at runtime in web environments
      const { cookies } = await import("next/headers");
      const store = await cookies();
      return store.get(name)?.value ?? null;
    } catch (_e) {
      return null;
    }
  }

  public async set(
    name: string,
    value: string,
    options?: CookieOptions,
  ): Promise<void> {
    try {
      // @ts-ignore
      const { cookies } = await import("next/headers");
      const store = await cookies();
      store.set(name, value, options);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[veap:NextCookieStore] Failed to set cookie:", e);
      }
    }
  }

  public async delete(name: string): Promise<void> {
    try {
      // @ts-ignore
      const { cookies } = await import("next/headers");
      const store = await cookies();
      store.delete(name);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[veap:NextCookieStore] Failed to delete cookie:", e);
      }
    }
  }
}

/**
 * Next.js adapter for the {@link IHttpRequestContext} port.
 *
 * Wraps `headers()` and `redirect()` from Next.js behind the kernel port
 * so services never need to import Next.js directly.
 */
export class NextRequestContext implements IHttpRequestContext {
  public async getHeader(name: string): Promise<string | null> {
    try {
      // @ts-ignore
      const { headers } = await import("next/headers");
      const store = await headers();
      return store.get(name);
    } catch (_e) {
      return null;
    }
  }

  public redirect(url: string): never {
    try {
      // @ts-ignore
      const nextNav = require("next/navigation");
      nextNav.redirect(url);
    } catch (err: any) {
      // Re-throw Next.js internal redirect signal (NEXT_REDIRECT)
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) {
        throw err;
      }
      throw new Error(`Redirect to ${url}`);
    }
    // Unreachable fallback to satisfy TypeScript 'never'
    throw new Error(`Redirect to ${url}`);
  }
}
