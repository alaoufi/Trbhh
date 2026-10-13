import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({query:vi.fn(),admin:vi.fn(),initiate:vi.fn(),config:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error(url);}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireUser:async()=>({uid:7})}));
vi.mock('@/lib/roles',()=>({requireAnyAdmin:state.admin}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query}}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:state.config}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:async()=>({id:'fixture',ready:true})}));
vi.mock('@/lib/commerce/gateway',()=>({initiateCommercePayment:state.initiate}));
import {payCommerceOrder} from '@/app/account/orders/actions';
function form(){const data=new FormData();data.set('orderId','2');data.set('confirm','1');return data;}
describe('owned private CJ bank handoff',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CJ_LIVE_TRIAL_ENABLED','true');state.admin.mockResolvedValue({uid:7});state.query.mockResolvedValue([{id:2n}]);state.config.mockResolvedValue({enabled:false,purchasingEnabled:true,paymentsEnabled:true});state.initiate.mockResolvedValue({status:'unavailable'});});afterEach(()=>vi.unstubAllEnvs());
 it('permits only staff-owned persisted CJ quote while general commerce stays disabled',async()=>{await expect(payCommerceOrder(form())).rejects.toThrow('/account/orders/2?payment=unavailable');expect(state.admin).toHaveBeenCalledOnce();expect(state.query.mock.calls[0].slice(1)).toEqual([2n,7n]);expect(state.initiate).toHaveBeenCalledWith(expect.anything(),{memberId:7n,orderId:2n},expect.objectContaining({ready:true}));});
 it('blocks bank initiation without a persisted owned CJ quote',async()=>{state.query.mockResolvedValue([]);await expect(payCommerceOrder(form())).rejects.toThrow('/account/orders/2?error=unavailable');expect(state.initiate).not.toHaveBeenCalled();});
 it('blocks bank initiation for a nonstaff customer',async()=>{state.admin.mockRejectedValueOnce(new Error('access_denied'));await expect(payCommerceOrder(form())).rejects.toThrow('/account/orders/2?error=unavailable');expect(state.initiate).not.toHaveBeenCalled();});
 it('cannot bypass central purchasing disabled during private trial',async()=>{state.config.mockResolvedValue({enabled:false,purchasingEnabled:false,paymentsEnabled:true});await expect(payCommerceOrder(form())).rejects.toThrow('/account/orders/2?error=purchasing');expect(state.query).not.toHaveBeenCalled();expect(state.initiate).not.toHaveBeenCalled();});
});
