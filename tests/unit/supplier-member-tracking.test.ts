vi.mock('@/lib/cj/fulfillment/notices',()=>({memberCjOrderNotices:async()=>[]}));
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {commerceConfigFromRows} from '@/lib/commerce/config';
vi.mock('@/lib/finance/schema',()=>({financeSchemaAvailable:async()=>false}));
const state=vi.hoisted(()=>({query:vi.fn(),tracking:vi.fn(),cjTracking:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireUser:async()=>({uid:7})}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query}}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:async()=>commerceConfigFromRows([{k:'commerce_enabled',v:'1'}])}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:async()=>null}));
vi.mock('@/lib/settings',()=>({getSetting:async(key:string,fallback:string)=>key==='supplier_tracking_title'?'Custom tracking':fallback}));
vi.mock('@/lib/suppliers/tracking',()=>({memberOrderTracking:state.tracking}));
vi.mock('@/lib/cj/fulfillment/status',()=>({memberCjOrderTracking:state.cjTracking}));
vi.mock('@/app/account/orders/actions',()=>({payCommerceOrder:vi.fn(),cancelCommerceOrder:vi.fn(),checkCommercePayment:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not_found');}}));
import Page from '@/app/account/orders/[id]/page';
beforeEach(()=>{vi.resetAllMocks();state.cjTracking.mockResolvedValue([]);});
describe('member shipment projection',()=>{
 it('renders shipment progress without supplier branding or a supplier portal',async()=>{
  state.query.mockResolvedValueOnce([{id:1n,status:'paid',total_minor:100,shipping_fee_minor:0,fulfillment_status:'shipped'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  state.tracking.mockResolvedValue([]);state.cjTracking.mockResolvedValue([{id:'cj-1',carrier:'CJPacket',trackingNumber:'REAL123',trackingUrl:'https://www.cjpacket.com/',status:'shipped'}]);
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})}));
  expect(html).not.toMatch(/CJ|cjpacket/);expect(html).toContain('REAL123');expect(html).toContain('تم شحن الطلب');
 });
 it('passes authenticated owner and escapes tracking text with editable labels',async()=>{
  state.query.mockResolvedValueOnce([{id:1n,status:'paid',total_minor:100,shipping_fee_minor:0}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  state.tracking.mockResolvedValue([{id:'1',carrier:'DHL',trackingNumber:'<script>evil</script>',status:'in_transit',fulfillmentStatus:'shipped'}]);
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})}));
  expect(state.tracking).toHaveBeenCalledWith(expect.anything(),1n,7n);expect(html).toContain('Custom tracking');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>evil');
  expect(state.cjTracking).toHaveBeenCalledWith(1n,7n);
 });
 it('does not query tracking for a non-owned order',async()=>{
  state.query.mockResolvedValueOnce([]);await expect(Page({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})})).rejects.toThrow('not_found');expect(state.tracking).not.toHaveBeenCalled();expect(state.cjTracking).not.toHaveBeenCalled();
 });
});
