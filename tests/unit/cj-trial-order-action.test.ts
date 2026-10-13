import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({quote:vi.fn(),create:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error(url);}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async()=>({uid:9})}));
vi.mock('@/lib/cj/trial-quote',()=>({quoteCjTrialCart:mock.quote}));
vi.mock('@/lib/cj/orders/store',()=>({createOrder:mock.create}));
vi.mock('@/lib/cj/destination',()=>({getCjDestinationAddress:async()=>({postalCode:'23455',fullName:'عنوان محفوظ',phone:'0500000000',city:'جدة',district:'حي محفوظ',street:'شارع محفوظ',buildingNumber:'1',region:'مكة'})}));
import {placeCjTrialOrder} from '@/app/cj/cart/actions';
const form=(qty=1)=>{const data=new FormData();for(const [key,value] of Object.entries({items:JSON.stringify([{id:4,qty,variantId:'blue-s',snapshot:{checkedAt:'2026-10-12T00:00:00Z'}}]),shipName:'عنوان محفوظ',shipPhone:'0500000000',shipCity:'جدة',shipRegion:'مكة',shipAddress1:'حي محفوظ، شارع محفوظ، 1',shipAddress2:'الرمز البريدي 23455'}))data.set(key,value);return data;};
beforeEach(()=>{vi.clearAllMocks();mock.create.mockResolvedValue({id:1n,created:true});mock.quote.mockResolvedValue({totalMinor:2200,rejected:[],lines:[{id:4,qty:1,title:'سلعة',variantId:'blue-s',variantSku:'SKU',unitMinor:1500,vatMinor:0,shippingName:'Standard'}]});});
describe('CJ trial order intent',()=>{
 it('binds the quoted postcode and stored delivery destination to the same owned address',async()=>{
  const data=form();
  await expect(placeCjTrialOrder(data)).rejects.toThrow('/admin/suppliers/cj/orders/1?created=1');
  expect(mock.quote.mock.calls[0][1]).toEqual({destinationZip:'23455'});
  expect(mock.create.mock.calls[0][0].ship).toMatchObject({city:'جدة',address2:'الرمز البريدي 23455',name:'عنوان محفوظ',zip:'23455'});
 });
 it('rejects a forged or changed delivery address before quoting or creating an order',async()=>{
  const data=form();data.set('shipCity','عنوان مزور');data.set('shipAddress2','11564');
  await expect(placeCjTrialOrder(data)).rejects.toThrow('/cj/cart?order=address');
  expect(mock.create).not.toHaveBeenCalled();expect(mock.quote).not.toHaveBeenCalled();
 });
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
