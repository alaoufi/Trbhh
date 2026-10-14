import {describe,it,expect,vi} from 'vitest';
import {resolveCjCheckoutRequestKey} from '@/lib/cj/checkout-renewal';
const now=new Date('2026-10-13T12:00:00Z'),base='cjt-1-original-intent';
function fixture(status='awaiting_payment',attempts=0,expiry='2026-10-13T11:59:00Z'){
 const query=vi.fn().mockResolvedValueOnce([{id:9n,status,attempts}]).mockResolvedValueOnce([{quote_json:{expiresAt:expiry}}]).mockResolvedValue([]),cancel=vi.fn().mockResolvedValue({});return {query,cancel,db:{$queryRaw:query}};
}
describe('unstarted expired CJ quote replacement',()=>{
 it('reuses the same fresh replacement after the original expired order was canceled',async()=>{const first=fixture();const version=await resolveCjCheckoutRequestKey(first.db as never,1n,base,now,first.cancel);const query=vi.fn().mockResolvedValueOnce([{id:9n,status:'cancelled',attempts:0}]).mockResolvedValueOnce([{id:10n,status:'awaiting_payment',attempts:0}]).mockResolvedValueOnce([{quote_json:{expiresAt:'2026-10-13T12:01:00Z'}}]);const cancel=vi.fn();expect(await resolveCjCheckoutRequestKey({$queryRaw:query} as never,1n,base,now,cancel)).toBe(version);expect(cancel).not.toHaveBeenCalled();});
 it('returns the same intent while its quote remains fresh',async()=>{const f=fixture('awaiting_payment',0,'2026-10-13T12:01:00Z');expect(await resolveCjCheckoutRequestKey(f.db as never,1n,base,now,f.cancel)).toBe(base);expect(f.cancel).not.toHaveBeenCalled();});
 it('cancels only an expired unstarted order and derives a stable new request version',async()=>{const f=fixture();const next=await resolveCjCheckoutRequestKey(f.db as never,1n,base,now,f.cancel);expect(next).not.toBe(base);expect(next.length).toBeLessThanOrEqual(80);expect(f.cancel).toHaveBeenCalledWith(f.db,{memberId:1n,orderId:9n});const other=fixture();expect(await resolveCjCheckoutRequestKey(other.db as never,1n,base,now,other.cancel)).toBe(next);});
 it.each(['creating','pending','uncertain'])('never replaces a quote with an existing %s bank attempt',async()=>{const f=fixture('awaiting_payment',1);expect(await resolveCjCheckoutRequestKey(f.db as never,1n,base,now,f.cancel)).toBe(base);expect(f.cancel).not.toHaveBeenCalled();});
 it('never replaces a paid order',async()=>{const f=fixture('paid');expect(await resolveCjCheckoutRequestKey(f.db as never,1n,base,now,f.cancel)).toBe(base);expect(f.cancel).not.toHaveBeenCalled();});
 it('does not create replacement when a concurrent bank attempt wins the order lock',async()=>{const f=fixture();f.cancel.mockRejectedValueOnce(new Error('payment_attempt_exists'));await expect(resolveCjCheckoutRequestKey(f.db as never,1n,base,now,f.cancel)).rejects.toThrow('payment_attempt_exists');});
});
