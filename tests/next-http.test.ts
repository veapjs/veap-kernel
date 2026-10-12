import { describe, expect, it } from "vitest";
import {
  COOKIE_STORE,
  ICookieStore,
  IHttpRequestContext,
  NextCookieStore,
  NextRequestContext,
  REQUEST_CONTEXT,
} from "../src/http/index.js";
import { app, container } from "../src/ioc/index.js";
import { KernelServiceProvider } from "../src/providers/kernel.provider.js";

describe("NextHttp adapters", () => {
  it("NextCookieStore gracefully returns null outside Next.js request context", async () => {
    const store = new NextCookieStore();
    const val = await store.get("test-cookie");
    expect(val).toBeNull();
  });

  it("NextCookieStore does not throw when set or delete is called outside Next.js context", async () => {
    const store = new NextCookieStore();
    await expect(store.set("test-cookie", "value")).resolves.toBeUndefined();
    await expect(store.delete("test-cookie")).resolves.toBeUndefined();
  });

  it("NextRequestContext returns null when header is queried outside Next.js context", async () => {
    const ctx = new NextRequestContext();
    const val = await ctx.getHeader("accept-language");
    expect(val).toBeNull();
  });

  it("KernelServiceProvider binds NextCookieStore and NextRequestContext by default", async () => {
    container.reset();
    const provider = new KernelServiceProvider(container);
    provider.register();

    const cookieStore = await app<ICookieStore>(COOKIE_STORE);
    expect(cookieStore).toBeInstanceOf(NextCookieStore);

    const requestContext = await app<IHttpRequestContext>(REQUEST_CONTEXT);
    expect(requestContext).toBeInstanceOf(NextRequestContext);
  });
});
