import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const commerce=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:commerce.read}));
import {cjPrivateRuntimeEnabled,cjPrivateFinancialOperationsAllowed} from '@/lib/cj/live-gates';
describe('isolated CJ private financial gates',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','false');for(const key of ['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'])vi.stubEnv(key,'true');commerce.read.mockResolvedValue({purchasingEnabled:true});});afterEach(()=>vi.unstubAllEnvs());
 it('permits the dedicated CJ path while shared Salla/legacy supplier gate stays false',async()=>{expect(cjPrivateRuntimeEnabled()).toBe(true);expect(await cjPrivateFinancialOperationsAllowed()).toBe(true);expect(process.env.SUPPLIER_ALLOW_LIVE_ORDERS).toBe('false');});
 it.each(['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'])('denies new CJ writes without %s even when shared supplier flag is on',async key=>{vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','true');vi.stubEnv(key,'false');expect(cjPrivateRuntimeEnabled()).toBe(false);expect(await cjPrivateFinancialOperationsAllowed()).toBe(false);expect(commerce.read).not.toHaveBeenCalled();});
 it.each([undefined,'1','TRUE'])('fails closed for a malformed dedicated CJ flag %s',value=>{vi.stubEnv('CJ_ALLOW_LIVE_ORDERS',value);expect(cjPrivateRuntimeEnabled()).toBe(false);});
 it('requires central purchasing approval and fails closed on settings outage',async()=>{commerce.read.mockResolvedValueOnce({purchasingEnabled:false});expect(await cjPrivateFinancialOperationsAllowed()).toBe(false);commerce.read.mockRejectedValueOnce(new Error('database'));expect(await cjPrivateFinancialOperationsAllowed()).toBe(false);});
});
