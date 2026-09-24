import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/finance/fiscal-policy',()=>({readApprovedFiscalPolicy:mock.read}));
import {quoteCjVat} from '@/lib/cj/tax-quote';
const policy={vatBps:1500,calculationPolicy:{version:2,priceBasis:'exclusive',itemScope:'uniform_catalog',shippingPriceBasis:'exclusive',shippingVatBps:1500,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'1',vatControl:{enabled:true,registrationConfirmed:true,registrationEffectiveFrom:'2026-01-01',registrationThresholdMinor:37500000}}};
beforeEach(()=>vi.clearAllMocks());
describe('CJ test quote VAT',()=>{
 it('keeps VAT off if there is no current approved finance policy',async()=>{mock.read.mockRejectedValue(Error('not approved'));expect(await quoteCjVat(1000,2,1000)).toEqual({enabled:false,vatMinor:0,totalMinor:3000});});
 it('uses the approved current product and shipping rates with integer halalas',async()=>{mock.read.mockResolvedValue(policy);expect(await quoteCjVat(1000,2,1000)).toEqual({enabled:true,vatMinor:450,totalMinor:3450});});
 it('preserves inclusive prices and extracts rather than adding VAT twice',async()=>{mock.read.mockResolvedValue({...policy,calculationPolicy:{...policy.calculationPolicy,priceBasis:'inclusive',shippingPriceBasis:'inclusive'}});expect(await quoteCjVat(1150,1,1150)).toEqual({enabled:true,vatMinor:300,totalMinor:2300});});
});
