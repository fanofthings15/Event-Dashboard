import NodeCache from "node-cache";

// stdTTL in seconds. Personal dashboard, low traffic — cache generously to
// stay well under each free-tier API's rate limits.
export const cache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  cache.set(key, value, ttlSeconds);
  return value;
}
