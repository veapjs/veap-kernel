import { describe, expect, it } from "vitest";
import { MemoryCacheProvider } from "../src/cache/memory-cache.js";

describe("MemoryCacheProvider", () => {
  it("returns null for non-existent keys", async () => {
    const cache = new MemoryCacheProvider();
    expect(await cache.get("missing")).toBeNull();
  });

  it("stores and retrieves values", async () => {
    const cache = new MemoryCacheProvider();
    await cache.set("user:1", { id: 1, name: "Alice" });

    const user = await cache.get<{ id: number; name: string }>("user:1");
    expect(user).toEqual({ id: 1, name: "Alice" });
  });

  it("deletes individual keys", async () => {
    const cache = new MemoryCacheProvider();
    await cache.set("key1", "val1");
    await cache.delete("key1");

    expect(await cache.get("key1")).toBeNull();
  });

  it("clears all keys", async () => {
    const cache = new MemoryCacheProvider();
    await cache.set("k1", 1);
    await cache.set("k2", 2);

    await cache.clear();

    expect(await cache.get("k1")).toBeNull();
    expect(await cache.get("k2")).toBeNull();
  });

  it("expires keys when TTL has elapsed", async () => {
    const cache = new MemoryCacheProvider();
    // 0.05 seconds = 50ms TTL
    await cache.set("expiring", "temporary", 0.05);

    expect(await cache.get("expiring")).toBe("temporary");

    // Wait 60ms
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(await cache.get("expiring")).toBeNull();
  });
});
