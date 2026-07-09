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

/* طبقة L1 داخل الذاكرة (احتياط): لو غاب Redis أو تعطّل، كانت كل «الكاشات»
   تسقط دفعة واحدة فيضرب كل تنقّل قاعدة البيانات مباشرة ويثقل التصفح.
   L1 قصيرة (بحد أقصى ٣٠ث) ومحدودة الحجم، وتُمسح مع أي إبطال. */
const L1_MAX = 500;
const L1_TTL_CAP_MS = 30_000;
const l1 = new Map<string, { v: unknown; exp: number }>();

function l1Get<T>(key: string): T | undefined {
  const e = l1.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) { l1.delete(key); return undefined; }
  return e.v as T;
}
function l1Set(key: string, v: unknown, ttlSeconds: number) {
  if (l1.size >= L1_MAX) { const first = l1.keys().next().value; if (first) l1.delete(first); }
  l1.set(key, { v, exp: Date.now() + Math.min(ttlSeconds * 1000, L1_TTL_CAP_MS) });
}
function l1DelPattern(pattern: string) {
  const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
  for (const k of l1.keys()) if (pattern.endsWith('*') ? k.startsWith(prefix) : k === pattern) l1.delete(k);
}

/** Invalidate one or more cache keys (no-op when Redis is unavailable). */
export async function cacheDel(...keys: string[]): Promise<void> {
  for (const k of keys) l1.delete(k);
  if (!redis || !keys.length) return;
  try {
    await redis.del(...keys);
  } catch {
    /* ignore cache delete errors */
  }
}

/** Delete every cache key matching a glob pattern (e.g. "ads:*"). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  l1DelPattern(pattern);
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* ignore cache delete errors */
  }
}

/** Cache-aside: L1 (ذاكرة) ثم Redis ثم المصدر. يعمل جيداً حتى بلا Redis. */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const l1Hit = l1Get<T>(key);
  if (l1Hit !== undefined) return l1Hit;
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit) {
        const parsed = JSON.parse(hit) as T;
        l1Set(key, parsed, ttlSeconds);
        return parsed;
      }
    } catch {
      /* ignore cache read errors */
    }
  }
  const value = await loader();
  l1Set(key, value, ttlSeconds);
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* ignore cache write errors */
    }
  }
  return value;
}
