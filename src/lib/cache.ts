/**
 * LocalStorage cache with stale-while-revalidate pattern.
 * Data loads instantly from cache, then refreshes in background.
 */

const CACHE_PREFIX = 'atr_cache:';

type CacheEntry<T> = {
  data: T;
  ts: number; // when cached (ms)
};

/** Read cached data. Returns null if nothing cached. */
export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return entry.data;
  } catch {
    return null;
  }
}

/** Write data to cache. */
export function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

/** Get the cache timestamp (when data was last cached). Returns 0 if not cached. */
export function cacheAge(key: string): number {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return Infinity;
    const entry = JSON.parse(raw) as CacheEntry<unknown>;
    return Date.now() - entry.ts;
  } catch {
    return Infinity;
  }
}

/** Remove a cache entry. */
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Build a cache key for a contract's AI responses. */
export function aiResponsesCacheKey(contractId: string): string {
  return `ai:${contractId}`;
}

/** Build a cache key for a contract's DEX orders. */
export function ordersCacheKey(contractAddress: string): string {
  return `orders:${contractAddress}`;
}

/** Build a cache key for a contract's DEX order stats. */
export function orderStatsCacheKey(contractAddress: string): string {
  return `order_stats:${contractAddress}`;
}

/** Build a cache key for coin symbol map. */
export function coinMapCacheKey(contractAddress: string): string {
  return `coins:${contractAddress}`;
}

/** Build a cache key for a contract's token balances. */
export function balancesCacheKey(contractAddress: string): string {
  return `bal:${contractAddress}`;
}
