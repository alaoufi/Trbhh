import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ jobs: new Map<string,string>(), lock: '', expirations: 0, enabled: true, search: false, prepare: vi.fn(), cached: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSetting: async () => state.enabled ? '1' : '0' }));
vi.mock('@/lib/ai/local', () => ({ localSearchActive: () => state.search }));
vi.mock('@/lib/cj/translate', () => ({ isArabicText: (s:string) => /[ء-ي]/.test(s), getCachedArabic: state.cached, prepareArabicTranslation: state.prepare }));
vi.mock('@/lib/redis', () => ({ redis: {
  set: async (_key:string, token:string) => { if(state.lock)return null; state.lock=token; return 'OK'; },
  hgetall: async () => Object.fromEntries(state.jobs),
  eval: async (script:string, _n:number, ...args:unknown[]) => {
    if(script.includes('HEXISTS')) { const [, id, job, cap] = args as string[]; if(state.jobs.has(id)||state.jobs.size>=Number(cap))return 0; state.jobs.set(id,job);return 1; }
    if(script.includes('HDEL')) { const [,,token,id,job] = args as string[]; if(token!==state.lock)return 0;if(job){state.jobs.set(id,job);if(script.includes('EXPIRE'))state.expirations++;}else state.jobs.delete(id);return 1; }
    const [, token] = args as string[]; if(token===state.lock)state.lock=''; return 1;
  },
} }));
import { enqueueArabicTranslations, runArabicTranslationWorker } from '@/lib/cj/translation-queue';
beforeEach(() => { state.jobs.clear();state.lock='';state.expirations=0;state.enabled=true;state.search=false;state.prepare.mockReset().mockResolvedValue('ترجمة عربية');state.cached.mockReset().mockResolvedValue(new Map()); });
describe('bounded text-only translation queue', () => {
  it('rejects oversized/empty input, deduplicates, and caps total queued text', async () => {
    expect(await enqueueArabicTranslations([' ', 'x'.repeat(20001), 'قميص', 'shirt', 'shirt'])).toBe(1);
    await enqueueArabicTranslations(Array.from({length:150},(_,i)=>`item ${i}`));
    expect(state.jobs.size).toBe(100);
  });
  it('does no work when disabled or search is active', async () => {
    state.enabled=false;expect(await enqueueArabicTranslations(['shirt'])).toBe(0);
    state.enabled=true;await enqueueArabicTranslations(['shirt']);state.search=true;
    expect((await runArabicTranslationWorker()).status).toBe('search_active');expect(state.prepare).not.toHaveBeenCalled();
  });
  it('uses manual/cache hits without inference and removes completed text', async () => {
    await enqueueArabicTranslations(['shirt']);state.cached.mockResolvedValue(new Map([['shirt','تصحيح يدوي']]));
    expect((await runArabicTranslationWorker()).completed).toBe(1);expect(state.prepare).not.toHaveBeenCalled();expect(state.jobs.size).toBe(0);
  });
  it('retries failure at most three times and recovers after an expired crash claim', async () => {
    await enqueueArabicTranslations(['shirt']);state.prepare.mockResolvedValue(null);state.lock='crashed-worker';
    expect((await runArabicTranslationWorker()).status).toBe('busy');state.lock='';
    for(let i=0;i<3;i++)await runArabicTranslationWorker();
    expect(state.prepare).toHaveBeenCalledTimes(3);expect(state.jobs.size).toBe(0);
  });
  it('drops expired or malformed jobs without inference', async () => {
    state.jobs.set('old',JSON.stringify({text:'shirt',created:Date.now()-86400001,attempts:0}));state.jobs.set('bad','{');
    expect((await runArabicTranslationWorker()).status).toBe('empty');expect(state.prepare).not.toHaveBeenCalled();expect(state.jobs.size).toBe(0);
  });
});

it('bounds escaped serialized payloads as well as source bytes', async () => {
 expect(await enqueueArabicTranslations(['x'+'\u0000'.repeat(19999)])).toBe(0);
 expect(await enqueueArabicTranslations(['line\n'.repeat(3000)])).toBe(1);
 for(const job of state.jobs.values())expect(Buffer.byteLength(job,'utf8')).toBeLessThanOrEqual(40000);
});
it('reports a lost lease instead of completed when another worker owns the claim', async () => {
 await enqueueArabicTranslations(['shirt']);state.prepare.mockImplementation(async()=>{state.lock='new-owner';return 'ترجمة عربية';});
 expect(await runArabicTranslationWorker()).toEqual({status:'lease_lost',completed:0});
 expect(state.lock).toBe('new-owner');expect(state.jobs.size).toBe(1);
});
it('restores expiry when a retry recreates an expired hash', async () => {
 await enqueueArabicTranslations(['shirt']);state.prepare.mockImplementation(async()=>{state.jobs.clear();return null;});
 expect((await runArabicTranslationWorker()).status).toBe('retry');
 expect(state.jobs.size).toBe(1);expect(state.expirations).toBe(2);
});
