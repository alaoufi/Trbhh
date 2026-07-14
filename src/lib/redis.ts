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

/* ---- تحديد المعدّل (rate limiting) لمنع تخمين كلمات المرور ----
   يعمل عبر Redis عند توفّره، وإلا يسقط لعدّاد في الذاكرة داخل العملية (احتياط
   يظلّ يحدّ من محاولات التخمين على العقدة الواحدة). */
const rlMem = new Map<string, { n: number; exp: number }>();

/** زِد عدّاد المفتاح وأعد قيمته الحالية (يضبط انتهاء النافذة عند أول زيادة). */
export async function rateHit(key: string, windowSec: number): Promise<number> {
  if (redis) {
    try {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowSec);
      return n;
    } catch { /* fall through to memory */ }
  }
  const now = Date.now();
  const e = rlMem.get(key);
  if (!e || now > e.exp) { rlMem.set(key, { n: 1, exp: now + windowSec * 1000 }); return 1; }
  e.n += 1;
  return e.n;
}

/** اقرأ العدّاد الحالي دون زيادته (0 إن غاب أو انتهت نافذته). */
export async function rateGet(key: string): Promise<number> {
  if (redis) {
    try { const v = await redis.get(key); return v ? parseInt(v, 10) || 0 : 0; } catch { /* fall through */ }
  }
  const e = rlMem.get(key);
  if (!e || Date.now() > e.exp) return 0;
  return e.n;
}

/** صفّر العدّاد (يُستدعى عند نجاح الدخول). */
export async function rateReset(key: string): Promise<void> {
  rlMem.delete(key);
  if (redis) { try { await redis.del(key); } catch { /* ignore */ } }
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
