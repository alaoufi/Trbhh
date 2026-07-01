import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Redis is optional in development. Returns null if REDIS_URL is not set. */
export const redis: Redis | null =
  globalForRedis.redis ??
  (process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false })
    : null);

if (process.env.NODE_ENV !== 'production' && redis) globalForRedis.redis = redis;

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
