// Small cache for parsed Print articles (SPEC §7.4 fidelity rule 7: cached per
// URL for about 24 h; a failed parse is not cached).
//
// Note: on serverless (Vercel) this cache lives in the memory of ONE function
// instance. Instances start cold, run in parallel and are recycled, so the
// cache is best effort only: it saves repeat work, it is never relied on.

export interface CacheEntry<T> {
  value: T;
  /** Time (ms, from `now`) when the entry was stored. */
  storedAt: number;
}

/** Map-like store. Iteration order must be insertion order (like Map): the
 *  first key is the least recently used one. */
export interface CacheStore<T> {
  get(key: string): CacheEntry<T> | undefined;
  set(key: string, entry: CacheEntry<T>): unknown;
  delete(key: string): unknown;
  keys(): IterableIterator<string>;
  readonly size: number;
}

export interface PrintCacheOptions<T> {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
  store?: CacheStore<T>;
  /** Extra check: a loader result for which this returns false is returned but not cached. */
  isCacheable?: (value: T) => boolean;
}

export interface PrintCache<T> {
  get(url: string): T | undefined;
  set(url: string, value: T): void;
  delete(url: string): void;
  readonly size: number;
  /** Returns the cached value or runs `loader` once per key at a time (single
   *  flight). Only successful results are cached. */
  cachedParse(url: string, loader: () => Promise<T>): Promise<T>;
}

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CACHE_MAX_ENTRIES = 100;

/** Cache key: lower-case scheme + host, default port dropped, fragment
 *  dropped, query kept. Non-URL input is used as is (trimmed). */
export function normalizeCacheKey(input: string): string {
  try {
    const u = new URL(input.trim()); // lower-cases scheme/host, drops :80 / :443
    u.hash = "";
    if (u.hostname.endsWith(".")) u.hostname = u.hostname.replace(/\.+$/, "");
    return u.href;
  } catch {
    return input.trim();
  }
}

export function createPrintCache<T>(opts: PrintCacheOptions<T> = {}): PrintCache<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxEntries = Math.max(1, opts.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES);
  const now = opts.now ?? Date.now;
  const store: CacheStore<T> = opts.store ?? new Map<string, CacheEntry<T>>();
  const isCacheable = opts.isCacheable ?? (() => true);
  const inflight = new Map<string, Promise<T>>();

  function getByKey(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (now() - entry.storedAt >= ttlMs) {
      store.delete(key);
      return undefined;
    }
    // LRU: move to the end.
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function setByKey(key: string, value: T): void {
    store.delete(key);
    store.set(key, { value, storedAt: now() });
    while (store.size > maxEntries) {
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
    }
  }

  return {
    get: (url) => getByKey(normalizeCacheKey(url)),
    set: (url, value) => setByKey(normalizeCacheKey(url), value),
    delete: (url) => {
      store.delete(normalizeCacheKey(url));
    },
    get size() {
      return store.size;
    },
    cachedParse(url, loader) {
      const key = normalizeCacheKey(url);
      const hit = getByKey(key);
      if (hit !== undefined) return Promise.resolve(hit);
      const running = inflight.get(key);
      if (running) return running;
      const p = (async () => {
        try {
          // Defer the call so `inflight.set` below always runs before `finally`,
          // even when the loader throws synchronously.
          const value = await Promise.resolve().then(loader);
          if (isCacheable(value)) setByKey(key, value);
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },
  };
}
