import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({config:vi.fn(),read:vi.fn(),run:vi.fn(),provider:vi.fn(),grant:vi.fn(),fresh:vi.fn()}));
vi.mock('@/lib/cj/settlements',()=>({getCjSettlementWalletAuthorization:mock.grant}));
vi.mock('@/lib/cj/fulfillment/freshness',()=>({verifyCjCommitmentFresh:mock.fresh}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:mock.config}));
vi.mock('@/lib/cj/fulfillment/store',()=>({fulfillmentStore:{read:mock.read}}));
vi.mock('@/lib/cj/fulfillment/worker',()=>({runFulfillment:mock.run}));
vi.mock('@/lib/cj/fulfillment/provider',()=>({makeFulfillmentProvider:mock.provider}));
import {processCjFulfillment} from '@/lib/cj/fulfillment';
describe('CJ dispatcher isolated activation boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','false');for(const key of ['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'])vi.stubEnv(key,'true');mock.config.mockResolvedValue({purchasingEnabled:true});mock.read.mockResolvedValue({status:'pending',customerPaidVerified:true,commitment:{supplierReference:'ref'}});mock.provider.mockReturnValue({});mock.grant.mockResolvedValue(null);mock.fresh.mockResolvedValue({ok:true});});afterEach(()=>vi.unstubAllEnvs());
 it('delegates to card-only worker with global supplier activation off',async()=>{await processCjFulfillment('7');expect(mock.run).toHaveBeenCalledExactlyOnceWith('7',expect.anything(),expect.anything(),{paymentMode:'card'});expect(process.env.SUPPLIER_ALLOW_LIVE_ORDERS).toBe('false');});
 it('uses only a stored explicit amount-bound wallet grant',async()=>{mock.grant.mockResolvedValue({payId:'p',shipmentOrderId:'s',expectedUsdMinor:1000,actorId:1n});await processCjFulfillment('7');expect(mock.run).toHaveBeenCalledWith('7',expect.anything(),expect.anything(),{paymentMode:'wallet',walletAuthorization:{payId:'p',shipmentOrderId:'s',expectedUsdMinor:1000}});});
 it('rejects shared activation without dedicated CJ activation before accessing outbox/provider',async()=>{vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','true');vi.stubEnv('CJ_ALLOW_LIVE_ORDERS','false');await expect(processCjFulfillment('7')).rejects.toThrow('cj_fulfillment_disabled');expect(mock.read).not.toHaveBeenCalled();expect(mock.provider).not.toHaveBeenCalled();expect(mock.run).not.toHaveBeenCalled();});
 it('cannot bypass central purchasing policy through private environment flags',async()=>{mock.config.mockResolvedValue({purchasingEnabled:false});await expect(processCjFulfillment('7')).rejects.toThrow('cj_fulfillment_disabled');expect(mock.read).not.toHaveBeenCalled();});
});
