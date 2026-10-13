import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const auth=vi.hoisted(()=>({admin:vi.fn()}));
vi.mock('@/lib/roles',()=>({requireAnyAdmin:auth.admin}));
import {requireCjLiveTrialAuthority,isOwnedCjLiveTrial} from '@/lib/cj/private-trial';
import {createOrder} from '@/lib/commerce/orders';
describe('private CJ live trial authority',()=>{
 beforeEach(()=>{vi.stubEnv('CJ_LIVE_TRIAL_ENABLED','true');auth.admin.mockResolvedValue({uid:7});});afterEach(()=>vi.unstubAllEnvs());
 it('requires real authenticated staff identity matching the order owner',async()=>{await expect(requireCjLiveTrialAuthority(7n)).resolves.toBeUndefined();await expect(requireCjLiveTrialAuthority(8n)).rejects.toThrow('cj_live_trial_owner_mismatch');});
 it.each(['false',undefined])('fails closed when dedicated trial flag is %s',async value=>{vi.stubEnv('CJ_LIVE_TRIAL_ENABLED',value);await expect(requireCjLiveTrialAuthority(7n)).rejects.toThrow('cj_live_trial_disabled');});
 it('requires a persisted owned CJ quote before bypassing public commerce visibility',async()=>{const query=vi.fn().mockResolvedValue([]);expect(await isOwnedCjLiveTrial({$queryRaw:query} as never,7n,2n)).toBe(false);query.mockResolvedValue([{id:2n}]);expect(await isOwnedCjLiveTrial({$queryRaw:query} as never,7n,2n)).toBe(true);expect(query.mock.calls[1].slice(1)).toEqual([2n,7n]);});
 it('enforces staff identity in the createOrder library before any DB write or public flag override',async()=>{
  const query=vi.fn(),transaction=vi.fn(),shipping={name:'Buyer',phone:'+966500000000',addressLine:'District، Street، 4',city:'Riyadh',postalCode:'12345',country:'SA' as const,region:'Riyadh',district:'District',street:'Street',buildingNumber:'4',secondaryNumber:'',alternatePhone:null,email:'',shortAddress:'',deliveryNotes:''};
  await expect(createOrder({$queryRaw:query,$transaction:transaction} as never,{memberId:8n,requestKey:'abcdefghijklmnop',items:[{productId:1n,quantity:1,variantKey:'V'}],shipping},{shippingFeeMinor:0,staffCjTrial:true,liveCjQuotes:[{} as never]})).rejects.toThrow('cj_live_trial_owner_mismatch');expect(query).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
 });
});
