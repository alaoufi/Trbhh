import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {commerceConfigFromRows} from '@/lib/commerce/config';
vi.mock('@/lib/finance/schema',()=>({financeSchemaAvailable:async()=>false}));
const state=vi.hoisted(()=>({query:vi.fn(),tracking:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireUser:async()=>({uid:7})}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query}}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:async()=>commerceConfigFromRows([{k:'commerce_enabled',v:'1'}])}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:async()=>null}));
vi.mock('@/lib/settings',()=>({getSetting:async(key:string,fallback:string)=>key==='supplier_tracking_title'?'Custom tracking':fallback}));
vi.mock('@/lib/suppliers/tracking',()=>({memberOrderTracking:state.tracking}));
vi.mock('@/app/account/orders/actions',()=>({payCommerceOrder:vi.fn(),cancelCommerceOrder:vi.fn(),checkCommercePayment:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not_found');}}));
import Page from '@/app/account/orders/[id]/page';
beforeEach(()=>vi.resetAllMocks());
describe('member shipment projection',()=>{
 it('passes authenticated owner and escapes tracking text with editable labels',async()=>{
  state.query.mockResolvedValueOnce([{id:1n,status:'paid',total_minor:100,shipping_fee_minor:0}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  state.tracking.mockResolvedValue([{id:'1',carrier:'DHL',trackingNumber:'<script>evil</script>',status:'in_transit',fulfillmentStatus:'shipped'}]);
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})}));
  expect(state.tracking).toHaveBeenCalledWith(expect.anything(),1n,7n);expect(html).toContain('Custom tracking');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>evil');
 });
 it('does not query tracking for a non-owned order',async()=>{
  state.query.mockResolvedValueOnce([]);await expect(Page({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})})).rejects.toThrow('not_found');expect(state.tracking).not.toHaveBeenCalled();
 });
});
