import {describe,it,expect,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierOrder} from '@/lib/suppliers/types';
import {recordSupplierTracking,memberOrderTracking} from '@/lib/suppliers/tracking';
const order:SupplierOrder={externalId:'88',status:'in_progress',paymentStatus:'paid',currency:'SAR',payableMinor:5000,sourceUpdatedAt:null,shipments:[{externalId:'90',carrier:'DHL',trackingNumber:'ABC',status:'in_transit',fulfillmentStatus:'shipped',sourceUpdatedAt:'2026-09-19T10:00:00Z'}]};
function fixture(date:Date|null=null){
 const writes:{sql:string;values:unknown[]}[]=[];
 const tx={$queryRaw:vi.fn(async(s:TemplateStringsArray)=>{
  const sql=s.join('?');if(sql.includes('FROM supplier_orders'))return [{id:3n,order_id:4n,member_id:5n,external_order_id:'88',status:'submitted'}];
  if(sql.includes('FROM supplier_shipments'))return date?[{id:9n,source_updated_at:date}]:[];
  throw new Error(sql);
 }),$executeRaw:vi.fn(async(s:TemplateStringsArray,...values:unknown[])=>{writes.push({sql:s.join('?'),values});return 1;})};
 return {writes,db:{$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx),$queryRaw:tx.$queryRaw} as unknown as CommerceDb};
}
describe('supplier tracking payment isolation',()=>{
 it('writes shipment plus deduplicated member-only notification, never payments',async()=>{
  const f=fixture();await recordSupplierTracking(f.db,1n,order);
  expect(f.writes.some(w=>w.sql.includes('INSERT INTO supplier_shipments'))).toBe(true);
  const notice=f.writes.find(w=>w.sql.includes('INSERT INTO commerce_notifications'))!;
  expect(notice.sql).toContain('ON DUPLICATE KEY');expect(notice.values).toContain('member:5');
  expect(f.writes.map(w=>w.sql).join(' ')).not.toMatch(/payment_status\s*=|UPDATE commerce_orders|commerce_receipts|wallet/);
  expect(notice.values.some(v=>typeof v==='string'&&/^ship:[a-f0-9]{32}$/.test(v))).toBe(true);
 });
 it('ignores stale shipment updates and emits no stale notification',async()=>{
  const f=fixture(new Date('2026-09-20T00:00:00Z'));await recordSupplierTracking(f.db,1n,order);
  expect(f.writes.some(w=>w.sql.includes('supplier_shipments')||w.sql.includes('commerce_notifications'))).toBe(false);
 });
 it('does not erase known timestamp with an undated response',async()=>{
  const f=fixture(new Date('2026-09-18T00:00:00Z'));await recordSupplierTracking(f.db,1n,{...order,shipments:[{...order.shipments[0],sourceUpdatedAt:null}]});
  expect(f.writes.some(w=>w.sql.includes('supplier_shipments'))).toBe(false);
 });
 it('uses event observation timestamp only when provider omits shipment date',async()=>{
  const f=fixture(new Date('2026-09-18T00:00:00Z'));await recordSupplierTracking(f.db,1n,{...order,shipments:[{...order.shipments[0],sourceUpdatedAt:null}]},'2026-09-19T00:00:00Z');
  expect(f.writes.find(w=>w.sql.includes('INSERT INTO supplier_shipments'))?.values).toContainEqual(new Date('2026-09-19T00:00:00Z'));
 });
 it('projects only carrier/tracking/status through an ownership-qualified query',async()=>{
  const query=vi.fn().mockResolvedValue([{id:9n,carrier:'DHL',tracking_number:'ABC',status:'in_transit',fulfillment_status:'shipped'}]);
  const rows=await memberOrderTracking({$queryRaw:query} as unknown as CommerceDb,4n,5n);
  expect(rows).toEqual([{id:'9',carrier:'DHL',trackingNumber:'ABC',status:'in_transit',fulfillmentStatus:'shipped'}]);
  expect(query.mock.calls[0][0].join('?')).toContain('o.member_id=');
  expect(JSON.stringify(rows)).not.toMatch(/supplier|cost|payable/);
 });
});
