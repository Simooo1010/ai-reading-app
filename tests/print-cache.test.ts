import { describe, expect, it } from "vitest";
import { createPrintCache, normalizeCacheKey, type CacheEntry } from "@/lib/print/cache";

// Values below are test fixtures.

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("normalizeCacheKey", () => {
  it.each([
    ["https://EXAMPLE.com/Path?q=1#frag", "https://example.com/Path?q=1"],
    ["https://example.com:443/a", "https://example.com/a"],
    ["http://example.com:80/a", "http://example.com/a"],
    ["HTTP://Example.COM/a?b=2&a=1", "http://example.com/a?b=2&a=1"],
    ["https://example.com./a", "https://example.com/a"],
    ["  https://example.com/a  ", "https://example.com/a"],
    ["not a url", "not a url"],
  ])("%s -> %s", (input, key) => {
    expect(normalizeCacheKey(input)).toBe(key);
  });

  it("keeps the query (different queries are different entries)", () => {
    expect(normalizeCacheKey("https://example.com/?p=1")).not.toBe(normalizeCacheKey("https://example.com/?p=2"));
  });
});

describe("createPrintCache", () => {
  it("get/set/delete use the normalized URL", () => {
    const c = createPrintCache<string>();
    c.set("https://EXAMPLE.com/a#x", "A");
    expect(c.get("https://example.com/a")).toBe("A");
    expect(c.size).toBe(1);
    c.delete("https://example.com:443/a");
    expect(c.get("https://example.com/a")).toBeUndefined();
  });

  it("entries expire after the TTL (default 24 h)", () => {
    const k = clock();
    const c = createPrintCache<string>({ now: k.now });
    c.set("https://example.com/a", "A");
    k.advance(24 * 60 * 60 * 1000 - 1);
    expect(c.get("https://example.com/a")).toBe("A");
    k.advance(1);
    expect(c.get("https://example.com/a")).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it("evicts the least recently used entry when full", () => {
    const c = createPrintCache<number>({ maxEntries: 3 });
    c.set("https://e.com/1", 1);
    c.set("https://e.com/2", 2);
    c.set("https://e.com/3", 3);
    c.get("https://e.com/1"); // 1 is now most recent
    c.set("https://e.com/4", 4); // evicts 2
    expect(c.get("https://e.com/2")).toBeUndefined();
    expect(c.get("https://e.com/1")).toBe(1);
    expect(c.get("https://e.com/3")).toBe(3);
    expect(c.get("https://e.com/4")).toBe(4);
    expect(c.size).toBe(3);
  });

  it("uses an injected store", () => {
    const store = new Map<string, CacheEntry<string>>();
    const c = createPrintCache<string>({ store, now: () => 5 });
    c.set("https://Example.com/a", "A");
    expect([...store.entries()]).toEqual([["https://example.com/a", { value: "A", storedAt: 5 }]]);
  });

  it("cachedParse caches a successful result", async () => {
    const c = createPrintCache<string>();
    let calls = 0;
    const loader = async () => `v${++calls}`;
    expect(await c.cachedParse("https://example.com/a", loader)).toBe("v1");
    expect(await c.cachedParse("https://EXAMPLE.com/a#top", loader)).toBe("v1");
    expect(calls).toBe(1);
  });

  it("a failed loader is not cached", async () => {
    const c = createPrintCache<string>();
    let calls = 0;
    await expect(
      c.cachedParse("https://example.com/a", async () => {
        calls++;
        throw new Error("parse failed");
      }),
    ).rejects.toThrow("parse failed");
    expect(c.get("https://example.com/a")).toBeUndefined();
    expect(await c.cachedParse("https://example.com/a", async () => `ok${++calls}`)).toBe("ok2");
  });

  it("a loader that throws synchronously is not cached and does not block later loads", async () => {
    const c = createPrintCache<string>();
    await expect(
      c.cachedParse("https://example.com/a", () => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");
    expect(await c.cachedParse("https://example.com/a", async () => "ok")).toBe("ok");
  });

  it("isCacheable can refuse a 'failed' result value", async () => {
    type R = { ok: boolean; n: number };
    const c = createPrintCache<R>({ isCacheable: (r) => r.ok });
    let n = 0;
    expect(await c.cachedParse("https://example.com/a", async () => ({ ok: false, n: ++n }))).toEqual({ ok: false, n: 1 });
    expect(await c.cachedParse("https://example.com/a", async () => ({ ok: true, n: ++n }))).toEqual({ ok: true, n: 2 });
    expect(await c.cachedParse("https://example.com/a", async () => ({ ok: true, n: ++n }))).toEqual({ ok: true, n: 2 });
  });

  it("single flight: concurrent loads of the same key run the loader once", async () => {
    const c = createPrintCache<string>();
    let calls = 0;
    let release!: (v: string) => void;
    const loader = () => {
      calls++;
      return new Promise<string>((r) => (release = r));
    };
    const a = c.cachedParse("https://example.com/a", loader);
    const b = c.cachedParse("https://example.com/a#other", loader);
    const other = c.cachedParse("https://example.com/b", async () => "B");
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    release("A");
    expect(await Promise.all([a, b, other])).toEqual(["A", "A", "B"]);
  });

  it("single flight: concurrent waiters all see the failure, and the next call retries", async () => {
    const c = createPrintCache<string>();
    let calls = 0;
    let fail!: (e: Error) => void;
    const loader = () => {
      calls++;
      return new Promise<string>((_, rej) => (fail = rej));
    };
    const a = c.cachedParse("https://example.com/a", loader);
    const b = c.cachedParse("https://example.com/a", loader);
    await Promise.resolve();
    await Promise.resolve();
    fail(new Error("down"));
    await expect(a).rejects.toThrow("down");
    await expect(b).rejects.toThrow("down");
    expect(calls).toBe(1);
    expect(await c.cachedParse("https://example.com/a", async () => "later")).toBe("later");
    expect(calls).toBe(1);
  });

  it("an expired entry is loaded again", async () => {
    const k = clock();
    const c = createPrintCache<string>({ now: k.now, ttlMs: 1000 });
    let n = 0;
    const loader = async () => `v${++n}`;
    expect(await c.cachedParse("https://example.com/a", loader)).toBe("v1");
    k.advance(1000);
    expect(await c.cachedParse("https://example.com/a", loader)).toBe("v2");
  });
});
