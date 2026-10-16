import { afterEach, expect, it, vi } from 'vitest';
const worker = vi.hoisted(() => vi.fn().mockResolvedValue({status:'empty',completed:0}));
vi.mock('@/lib/cj/translation-queue', () => ({runArabicTranslationWorker:worker}));
import { POST } from '@/app/api/internal/cj/translate/route';
afterEach(() => {vi.unstubAllEnvs();worker.mockClear();});
it('rejects missing configuration and unauthorized callers before touching the queue', async () => {
  vi.stubEnv('SUPPLIER_RECONCILE_SECRET','');expect((await POST(new Request('http://localhost'))).status).toBe(503);
  vi.stubEnv('SUPPLIER_RECONCILE_SECRET','s'.repeat(32));
  for(const authorization of ['', 'Bearer wrong', 'Basic secret', 'Bearer '+'x'.repeat(1025)])expect((await POST(new Request('http://localhost',{headers:{authorization}}))).status).toBe(401);
  expect(worker).not.toHaveBeenCalled();
});
it('authenticated ticks invoke only the text worker', async () => {
  vi.stubEnv('SUPPLIER_RECONCILE_SECRET','s'.repeat(32));
  const result=await POST(new Request('http://localhost',{headers:{authorization:'Bearer '+'s'.repeat(32)}}));
  expect(result.status).toBe(200);expect(await result.json()).toEqual({ok:true,worker:{status:'empty',completed:0}});expect(worker).toHaveBeenCalledOnce();
});
