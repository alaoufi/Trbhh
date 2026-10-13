import {beforeEach,describe,expect,it,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/prisma',()=>({prisma:{site_settings:{findMany:read}}}));
import {readVerifiedCjPricing} from '@/lib/cj/verified-pricing';
beforeEach(()=>{read.mockReset();});
describe('confirmed CJ pricing configuration',()=>{
  it('uses only exact configured integer FX and margin values',async()=>{
    read.mockResolvedValue([{k:'cj_usd_to_sar_x100',v:'375'},{k:'commerce_default_margin_bps',v:'3000'}]);
    expect(await readVerifiedCjPricing()).toEqual({usdToSarX100:375,marginBps:3000});
  });
  it.each(['375.5','375bad','-1','0','100001'])('does not guess when FX is malformed (%s)',async fx=>{
    read.mockResolvedValue([{k:'cj_usd_to_sar_x100',v:fx},{k:'commerce_default_margin_bps',v:'3000'}]);
    await expect(readVerifiedCjPricing()).rejects.toThrow('cj_pricing_unverified');
  });
  it('does not replace absent configuration or a database outage with defaults',async()=>{
    read.mockResolvedValue([]);await expect(readVerifiedCjPricing()).rejects.toThrow('cj_pricing_unverified');
    read.mockRejectedValue(Error('offline'));await expect(readVerifiedCjPricing()).rejects.toThrow('offline');
  });
});
