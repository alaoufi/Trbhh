import {expect,it,vi} from 'vitest';
vi.mock('@/lib/settings',()=>({getSetting:vi.fn(),setSetting:vi.fn()}));
import {automaticCjPricing} from '@/lib/cj/automatic-pricing';
import {computePrice} from '@/lib/cj/pricing';
it('adds configured profit to source cost once before shipping, ignoring stale product overrides',()=>{const product={other_costs_minor:0,margin_bps:0,sale_price_override_minor:2000};const policy=automaticCjPricing({marginBps:3000},product);expect(policy.saleOverrideMinor).toBeNull();const quote=computePrice(2000,0,policy.otherCostsMinor,policy.marginBps);expect(quote.salePriceMinor).toBe(2600);expect(quote.salePriceMinor+1000).toBe(3600);expect(quote.profitMinor).toBe(600);});
it('uses saved margins and rejects unverified configuration',()=>{expect(automaticCjPricing({marginBps:2500},{other_costs_minor:0}).marginBps).toBe(2500);expect(()=>automaticCjPricing({marginBps:NaN},{other_costs_minor:0})).toThrow();});
