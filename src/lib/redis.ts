import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

/**
 * Redis is an OPTIONAL cache. It must NEVER crash the app:
 * - lazy connect + short retries so a missing/unreachable Redis fails fast
 * - an 'error' handler so ioredis never throws an unhandled 'error' event
 *   (which would take down the whole Node process)
 */
function createRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    retryStrategy: (times) => (times > 10 ? null : Math.min(times * 300, 3000)),
  });
  client.on('error', () => {
    /* swallow — the app runs fine without the cache */
  });
  client.connect().catch(() => {});
  return client;
}

export const redis: Redis | null = globalForRedis.redis ?? createRedis();

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

/** Invalidate one or more cache keys (no-op when Redis is unavailable). */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis || !keys.length) return;
  try {
    await redis.del(...keys);
  } catch {
    /* ignore cache delete errors */
  }
}

/** Delete every cache key matching a glob pattern (e.g. "ads:*"). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* ignore cache delete errors */
  }
}

/** Simple cache-aside helper. Falls back to the loader when Redis is unavailable. */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  if (!redis) return loader();
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    /* ignore cache read errors */
  }
  const value = await loader();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* ignore cache write errors */
  }
  return value;
}
