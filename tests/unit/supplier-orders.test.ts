import {describe,it,expect,vi} from 'vitest';
import {dispatchSupplierOrder} from '@/lib/suppliers/orders';
import type {CommerceDb} from '@/lib/commerce/types';
import {supplierConfig} from '@/lib/suppliers/config';
const config=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa'});
const snapshot={idempotencyKey:'supplier:41:1',merchantOrderId:'41',currency:'SAR' as const,shippingMinor:0,productIds:['12'],shipping:{name:'محمد',phone:'+966500000000',addressLine:'العنوان',city:'الرياض',postalCode:'12345',country:'SA' as const},items:[{externalId:'123',name:'منتج',sku:'SKU',quantity:1,unitCostMinor:100}]};
const liveRow={id:5n,order_id:41n,connection_id:7n,supplier_id:3n,status:'pending',attempts:0,external_order_id:null,store_coordinator_phone:'+966511111111',active:1,maintenance:0,auto_orders_enabled:1,mode:'live',connection_status:'connected',request_snapshot:snapshot};
describe('supplier order dispatch gates',()=>{
 it('does not dispatch an order without a verified receipt',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;expect(await dispatchSupplierOrder(db,1n,config)).toEqual({status:'ineligible'});expect(tx.$executeRaw).not.toHaveBeenCalled();});
 it('does not reclaim submitted or unknown orders',async()=>{const tx={$queryRaw:vi.fn().mockResolvedValue([{status:'unknown'}]),$executeRaw:vi.fn()};const db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;expect(await dispatchSupplierOrder(db,1n,config)).toEqual({status:'ineligible'});expect(tx.$executeRaw).not.toHaveBeenCalled();});
 it('keeps live ordering disabled without calling Salla',async()=>{
  const query=vi.fn().mockResolvedValueOnce([liveRow]).mockResolvedValueOnce([{active:1}]),execute=vi.fn().mockResolvedValue(1),db={$transaction:vi.fn(fn=>fn({$queryRaw:query,$executeRaw:execute}))} as unknown as CommerceDb,factory=vi.fn();
  expect(await dispatchSupplierOrder(db,5n,config,factory as never)).toEqual({status:'blocked'});
  expect(factory).not.toHaveBeenCalled();
 });
 it('submits one paid live order and enqueues only a coordinator outbox reference',async()=>{
  const query=vi.fn().mockResolvedValueOnce([liveRow]).mockResolvedValueOnce([{active:1}]).mockResolvedValueOnce([{id:5n}]),execute=vi.fn().mockResolvedValue(1);
  const db={$transaction:vi.fn(fn=>fn({$queryRaw:query,$executeRaw:execute}))} as unknown as CommerceDb;
  const adapter={createOrder:vi.fn().mockResolvedValue({status:'submitted',externalOrderId:'9001',externalOrderUrl:'https://s.salla.sa/orders/order/safe',externalCustomerId:'77'})};
  const factory=vi.fn().mockResolvedValue(adapter);
  expect(await dispatchSupplierOrder(db,5n,supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'true'}),factory as never)).toEqual({status:'submitted'});
  expect(adapter.createOrder).toHaveBeenCalledOnce();
  const sql=execute.mock.calls.map(c=>c[0].join('?'));
  expect(sql.filter(s=>s.startsWith('INSERT INTO supplier_order_sync_attempts'))).toHaveLength(1);
  const notice=execute.mock.calls.find(c=>c[0].join('?').startsWith('INSERT INTO supplier_coordinator_notifications'));
  expect(notice?.slice(1)).toContain('+966511111111');
  expect(notice?.[0].join('?')).not.toMatch(/payload|customer|address|items/);
 });
 it('submits normally without creating a notification when no coordinator exists',async()=>{
  const query=vi.fn().mockResolvedValueOnce([{...liveRow,store_coordinator_phone:''}]).mockResolvedValueOnce([{active:1}]).mockResolvedValueOnce([{id:5n}]),execute=vi.fn().mockResolvedValue(1);
  const db={$transaction:vi.fn(fn=>fn({$queryRaw:query,$executeRaw:execute}))} as unknown as CommerceDb;
  const factory=vi.fn().mockResolvedValue({createOrder:vi.fn().mockResolvedValue({status:'submitted',externalOrderId:'9002',externalOrderUrl:'https://s.salla.sa/orders/order/safe2',externalCustomerId:'78'})});
  expect(await dispatchSupplierOrder(db,5n,supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'true'}),factory as never)).toEqual({status:'submitted'});
  expect(execute.mock.calls.map(c=>c[0].join('?')).join('\n')).not.toContain('supplier_coordinator_notifications');
 });
 it('marks an ambiguous Salla failure unknown and never enqueues the coordinator notice',async()=>{
  const query=vi.fn().mockResolvedValueOnce([liveRow]).mockResolvedValueOnce([{active:1}]),execute=vi.fn().mockResolvedValue(1);
  const db={$transaction:vi.fn(fn=>fn({$queryRaw:query,$executeRaw:execute}))} as unknown as CommerceDb;
  const factory=vi.fn().mockResolvedValue({createOrder:vi.fn().mockRejectedValue(new Error('salla_request_failed'))});
  expect(await dispatchSupplierOrder(db,5n,supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'true'}),factory as never)).toEqual({status:'unknown'});
  const sql=execute.mock.calls.map(c=>c[0].join('?')).join('\n');
  expect(sql).toContain("SET status='unknown'");expect(sql).not.toContain('supplier_coordinator_notifications');
 });
});
