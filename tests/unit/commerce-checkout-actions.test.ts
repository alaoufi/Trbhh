import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({user:vi.fn(),config:vi.fn(),gateway:vi.fn(),attempt:vi.fn(),address:vi.fn(),createOrder:vi.fn(),redirect:vi.fn((url:string):never=>{throw new Error(`redirect:${url}`);})}));
vi.mock('@/lib/auth',()=>({requireUser:state.user}));
vi.mock('@/lib/auth-security',()=>({takeSecurityAttempt:state.attempt}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:state.config}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:state.gateway}));
vi.mock('@/lib/commerce/orders',()=>({createOrder:state.createOrder}));
vi.mock('@/lib/commerce/address-book',()=>({getMemberAddress:state.address}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('next/navigation',()=>({redirect:state.redirect}));
import {commerceConfigFromRows} from '@/lib/commerce/config';
import {createCommerceOrder} from '@/app/shop/actions';
function config(){return commerceConfigFromRows([{k:'commerce_enabled',v:'1'},{k:'commerce_payments_enabled',v:'1'},{k:'commerce_purchasing_enabled',v:'1'},{k:'commerce_shipping_fee_sar',v:'15'},{k:'commerce_shipping_terms',v:'Fixture terms'},{k:'commerce_checkout_error_text',v:'Fixture invalid checkout'},{k:'commerce_rate_limit_text',v:'Fixture rate limited'}]);}
function form(){const fd=new FormData();for(const [key,value] of Object.entries({productId:'17',quantity:'2',addressId:'72',terms:'1',requestKey:'fixture-checkout-request-001'}))fd.set(key,value);return fd;}
const snapshot={label:'المنزل',fullName:'Fixture Member',phone:'+966501234567',alternatePhone:null,email:'',country:'SA' as const,region:'منطقة الرياض',city:'الخرج',district:'حي النرجس',street:'شارع 1',buildingNumber:'4',secondaryNumber:'',postalCode:'12345',shortAddress:'',deliveryNotes:''};
describe('commerce checkout action boundary',()=>{
 beforeEach(()=>{vi.resetAllMocks();state.redirect.mockImplementation((url:string):never=>{throw new Error(`redirect:${url}`);});state.user.mockResolvedValue({uid:42});state.config.mockResolvedValue(config());state.gateway.mockResolvedValue({ready:true});state.attempt.mockResolvedValue(true);state.address.mockResolvedValue({id:72n,label:'المنزل',isDefault:true,snapshot});state.createOrder.mockResolvedValue({id:901n});});
 it('rate-limits before looking up an address or creating the order',async()=>{state.attempt.mockResolvedValue(false);await expect(createCommerceOrder(null,form())).resolves.toEqual({error:config().text.rateLimit});expect(state.address).not.toHaveBeenCalled();expect(state.createOrder).not.toHaveBeenCalled();});
 it.each([['productId','bad'],['quantity','0'],['addressId','0'],['terms','true'],['requestKey','bad']])('rejects invalid %s before lookup',async(key,value)=>{const fd=form();fd.set(key,value);await expect(createCommerceOrder(null,fd)).resolves.toMatchObject({error:'Fixture invalid checkout'});expect(state.address).not.toHaveBeenCalled();expect(state.createOrder).not.toHaveBeenCalled();});
 it('reads a saved address for the authenticated member and snapshots its trusted data',async()=>{const fd=form();fd.set('memberId','999');fd.set('phone','forged');fd.set('address','forged');await expect(createCommerceOrder(null,fd)).rejects.toThrow('redirect:/account/orders/901');expect(state.address).toHaveBeenCalledExactlyOnceWith(42n,72n);expect(state.createOrder).toHaveBeenCalledExactlyOnceWith(expect.anything(),{memberId:42n,requestKey:'fixture-checkout-request-001',items:[{productId:17n,quantity:2}],shipping:{name:'Fixture Member',phone:'+966501234567',addressLine:'حي النرجس، شارع 1، 4',city:'الخرج',postalCode:'12345',country:'SA',region:'منطقة الرياض',district:'حي النرجس',street:'شارع 1',buildingNumber:'4',secondaryNumber:'',alternatePhone:null,email:'',shortAddress:'',deliveryNotes:''}},{shippingFeeMinor:1500});});
 it('blocks order creation when the selected address is absent or not owned',async()=>{state.address.mockResolvedValue(null);await expect(createCommerceOrder(null,form())).resolves.toMatchObject({error:'اختر عنوان شحن محفوظًا في حسابك قبل متابعة الطلب.'});expect(state.createOrder).not.toHaveBeenCalled();});
 it('requires authentication before address lookup or order creation',async()=>{state.user.mockRejectedValue(new Error('authentication_required'));await expect(createCommerceOrder(null,form())).rejects.toThrow('authentication_required');expect(state.address).not.toHaveBeenCalled();expect(state.createOrder).not.toHaveBeenCalled();});
});
