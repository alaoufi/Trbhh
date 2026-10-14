import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/cj/client',()=>({cjFulfillmentTransport:vi.fn(),getCjBalance:vi.fn(),getCjBillingHistory:vi.fn(),getVariants:vi.fn()}));
import {exactUsdMinor} from '@/lib/cj/fulfillment/provider';
import {mapCjStatus} from '@/lib/cj/orders/state';
describe('CJ independent proof',()=>{
 it('never maps paid without billing proof to supplier acceptance',()=>expect(mapCjStatus('PAID')).toBeNull());
 it('does not map an undefined undelivered label to preparing',()=>expect(mapCjStatus('UNDELIVERED')).toBeNull());
 it('refuses missing and fractional cents',()=>{expect(exactUsdMinor(null)).toBeNull();expect(exactUsdMinor('')).toBeNull();expect(exactUsdMinor('1.001')).toBeNull();expect(exactUsdMinor('1.01')).toBe(101);});
});
