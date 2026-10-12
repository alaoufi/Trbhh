import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({quote:vi.fn(),create:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error(url);}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async()=>({uid:9})}));
vi.mock('@/lib/cj/trial-quote',()=>({quoteCjTrialCart:mock.quote}));
vi.mock('@/lib/cj/orders/store',()=>({createOrder:mock.create}));
import {placeCjTrialOrder} from '@/app/cj/cart/actions';
const form=(qty=1)=>{const data=new FormData();for(const [key,value] of Object.entries({items:JSON.stringify([{id:4,qty,variantId:'blue-s',snapshot:{checkedAt:'2026-10-12T00:00:00Z'}}]),shipName:'اختبار',shipPhone:'0500000000',shipCity:'الرياض',shipAddress1:'عنوان اختبار'}))data.set(key,value);return data;};
beforeEach(()=>{vi.clearAllMocks();mock.create.mockResolvedValue({id:1n,created:true});mock.quote.mockResolvedValue({totalMinor:2200,rejected:[],lines:[{id:4,qty:1,title:'سلعة',variantId:'blue-s',variantSku:'SKU',unitMinor:1500,vatMinor:0,shippingName:'Standard'}]});});
describe('CJ trial order intent',()=>{
 it('reuses the existing store uniqueness key for repeated identical submissions',async()=>{
  await expect(placeCjTrialOrder(form())).rejects.toThrow('/admin/suppliers/cj/orders/1?created=1');
  await expect(placeCjTrialOrder(form())).rejects.toThrow('/admin/suppliers/cj/orders/1?created=1');
  expect(mock.create.mock.calls[0][0].internalRef).toBe(mock.create.mock.calls[1][0].internalRef);
  expect(mock.create.mock.calls[0][0].internalRef.length).toBeLessThanOrEqual(64);
  await expect(placeCjTrialOrder(form(2))).rejects.toThrow('/admin/suppliers/cj/orders/1?created=1');
  expect(mock.create.mock.calls[2][0].internalRef).not.toBe(mock.create.mock.calls[0][0].internalRef);
 });
 it('does not create any order when current shipping validation rejects',async()=>{
  mock.quote.mockResolvedValue({totalMinor:0,lines:[],rejected:[{reason:'shipping_changed'}]});
  await expect(placeCjTrialOrder(form())).rejects.toThrow('/cj/cart?order=recheck');expect(mock.create).not.toHaveBeenCalled();
 });
});
