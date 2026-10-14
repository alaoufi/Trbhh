import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({config:vi.fn(),read:vi.fn(),run:vi.fn(),provider:vi.fn()}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:mock.config}));
vi.mock('@/lib/cj/fulfillment/store',()=>({fulfillmentStore:{read:mock.read}}));
vi.mock('@/lib/cj/fulfillment/worker',()=>({runFulfillment:mock.run}));
vi.mock('@/lib/cj/fulfillment/provider',()=>({makeFulfillmentProvider:mock.provider}));
import {processCjFulfillment} from '@/lib/cj/fulfillment';
describe('CJ dispatcher isolated activation boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','false');for(const key of ['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'])vi.stubEnv(key,'true');mock.config.mockResolvedValue({purchasingEnabled:true});mock.read.mockResolvedValue({commitment:{supplierReference:'ref'}});mock.provider.mockReturnValue({});});afterEach(()=>vi.unstubAllEnvs());
 it('delegates to the durable receipt-verifying worker with global supplier activation off',async()=>{await processCjFulfillment('7');expect(mock.read).toHaveBeenCalledExactlyOnceWith('7');expect(mock.run).toHaveBeenCalledExactlyOnceWith('7',expect.anything(),expect.anything());expect(process.env.SUPPLIER_ALLOW_LIVE_ORDERS).toBe('false');});
 it('rejects shared activation without dedicated CJ activation before accessing outbox/provider',async()=>{vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','true');vi.stubEnv('CJ_ALLOW_LIVE_ORDERS','false');await expect(processCjFulfillment('7')).rejects.toThrow('cj_fulfillment_disabled');expect(mock.read).not.toHaveBeenCalled();expect(mock.provider).not.toHaveBeenCalled();expect(mock.run).not.toHaveBeenCalled();});
 it('cannot bypass central purchasing policy through private environment flags',async()=>{mock.config.mockResolvedValue({purchasingEnabled:false});await expect(processCjFulfillment('7')).rejects.toThrow('cj_fulfillment_disabled');expect(mock.read).not.toHaveBeenCalled();});
});
