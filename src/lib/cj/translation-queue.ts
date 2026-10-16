import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { redis } from '@/lib/redis';
import { getSetting } from '@/lib/settings';
import { localSearchActive } from '@/lib/ai/local';
import { getCachedArabic, isArabicText, prepareArabicTranslation } from './translate';

// One bounded hash, never a Redis key scan. Payloads contain source text only.
export const TRANSLATION_QUEUE_LIMIT = 100;
export const TRANSLATION_SOURCE_BYTES = 20_000;
export const TRANSLATION_JOB_BYTES = 40_000;
const QUEUE = 'cj:translation:text:v1';
const LOCK = `${QUEUE}:claim`;
const TTL = 86400;
const LEASE_MS = 90_000;
type Job = { text: string; created: number; attempts: number };
const enqueueScript = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;
const releaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const finishScript = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[3] == '' then redis.call('HDEL', KEYS[2], ARGV[2]) else redis.call('HSET', KEYS[2], ARGV[2], ARGV[3]); redis.call('EXPIRE', KEYS[2], 86400) end
return 1`;
async function enabled() {
  return await getSetting('local_ai_enabled', '1').catch(() => '0') === '1' && await getSetting('local_ai_background_translation_enabled', '0').catch(() => '0') === '1';
}
export function validTranslationSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= TRANSLATION_SOURCE_BYTES;
}
export async function enqueueArabicTranslations(texts: (string | null | undefined)[]): Promise<number> {
  if (!redis || !await enabled()) return 0;
  let count = 0;
  for (const raw of texts.slice(0, TRANSLATION_QUEUE_LIMIT)) {
    if (!validTranslationSource(raw)) continue;
    const text = raw.trim();
    if (isArabicText(text)) continue;
    const serialized = JSON.stringify({ text, created: Date.now(), attempts: 0 });
    if (Buffer.byteLength(serialized, 'utf8') > TRANSLATION_JOB_BYTES) continue;
    const id = createHash('sha256').update(text).digest('hex');
    try {
      count += Number(await redis.eval(enqueueScript, 1, QUEUE, id, serialized, TRANSLATION_QUEUE_LIMIT, TTL)) || 0;
    } catch { break; }
  }
  return count;
}

/** One text per authenticated tick. Crashes retain the text; the global lease expires. */
export async function runArabicTranslationWorker(): Promise<{ status: string; completed: number }> {
  if (!redis || !await enabled()) return { status: 'disabled', completed: 0 };
  if (localSearchActive()) return { status: 'search_active', completed: 0 };
  const token = randomUUID();
  try {
    if (await redis.set(LOCK, token, 'PX', LEASE_MS, 'NX') !== 'OK') return { status: 'busy', completed: 0 };
    // HGETALL is bounded by the atomic enqueue cap (100 jobs / 4 MB serialized).
    const jobs = await redis.hgetall(QUEUE);
    for (const [id, serialized] of Object.entries(jobs).slice(0, TRANSLATION_QUEUE_LIMIT)) {
      let job: Job;
      try { if (Buffer.byteLength(serialized, 'utf8') > TRANSLATION_JOB_BYTES) throw new Error('oversized_job'); job = JSON.parse(serialized); } catch { await redis.eval(finishScript, 2, LOCK, QUEUE, token, id, ''); continue; }
      if (!job || !validTranslationSource(job.text) || !Number.isFinite(job.created) || job.created > Date.now() || Date.now() - job.created >= TTL * 1000 || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts >= 3) {
        await redis.eval(finishScript, 2, LOCK, QUEUE, token, id, ''); continue;
      }
      if (localSearchActive()) return { status: 'search_active', completed: 0 };
      // Persist the attempt BEFORE inference, so repeated process crashes are bounded too.
      job.attempts++;
      if (!Number(await redis.eval(finishScript, 2, LOCK, QUEUE, token, id, JSON.stringify(job)))) return { status: 'lease_lost', completed: 0 };
      const cached = (await getCachedArabic([job.text])).get(job.text);
      const translated = cached || await prepareArabicTranslation(job.text, 50_000);
      if (!Number(await redis.eval(finishScript, 2, LOCK, QUEUE, token, id, translated || job.attempts >= 3 ? '' : JSON.stringify(job)))) return { status: 'lease_lost', completed: 0 };
      return { status: translated ? 'completed' : 'retry', completed: translated ? 1 : 0 };
    }
    return { status: 'empty', completed: 0 };
  } catch { return { status: 'unavailable', completed: 0 }; }
  finally { await redis.eval(releaseScript, 1, LOCK, token).catch(() => {}); }
}
