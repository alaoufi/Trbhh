import {describe,it,expect,vi} from 'vitest';
import {enqueuePaidCjFulfillment,requireLiveCjQuotesAtPayment} from '@/lib/cj/bank-handoff';
describe('verified bank transaction CJ handoff',()=>{
 it('preserves nonCJ checkout without requiring a CJ quote',async()=>{const query=vi.fn().mockResolvedValue([]);await requireLiveCjQuotesAtPayment({$queryRaw:query} as never,9n,new Date());expect(query).toHaveBeenCalledTimes(1);});
 it('blocks a generic CJ commerce order without immutable live quote',async()=>{const query=vi.fn().mockResolvedValueOnce([{product_id:2n,quantity:1,variant_key:'V',shipping:{},total_minor:1}]).mockResolvedValueOnce([]);await expect(requireLiveCjQuotesAtPayment({$queryRaw:query} as never,9n,new Date())).rejects.toThrow('cj_live_quote_required');});
 it('inserts only immutable saved quotes joined to verified SAR receipt and paid order',async()=>{
  const execute=vi.fn().mockResolvedValue(1);const tx={$executeRaw:execute};
  await enqueuePaidCjFulfillment(tx as never,9n);
  const sql=execute.mock.calls[0][0].join('?');
  expect(sql).toContain('commerce_receipts');expect(sql).toContain("o.status='paid'");expect(sql).toContain('r.amount_minor=o.total_minor');expect(sql).toContain('ON DUPLICATE KEY UPDATE id=id');expect(execute.mock.calls[0].slice(1)).toEqual([9n]);
 });
});
