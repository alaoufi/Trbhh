import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from '@/lib/suppliers/config';
vi.mock('@/lib/suppliers/registry',()=>({adapterForConnection:vi.fn()}));
vi.mock('@/lib/suppliers/catalog',()=>({upsertSourceProduct:vi.fn()}));
vi.mock('@/lib/suppliers/schema',()=>({assertSupplierSchemaReady:vi.fn()}));
vi.mock('@/lib/suppliers/sync',()=>({syncConnection:vi.fn().mockResolvedValue({imported:0})}));
vi.mock('@/lib/suppliers/orders',()=>({dispatchSupplierOrder:vi.fn().mockResolvedValue({status:'simulated'})}));
import {adapterForConnection} from '@/lib/suppliers/registry';
import {upsertSourceProduct} from '@/lib/suppliers/catalog';
import {processNextSupplierEvent,reconcileSuppliers} from '@/lib/suppliers/worker';
const config={} as SupplierConfig;
function fixture(){
 const writes:{sql:string;values:unknown[]}[]=[];
 const event={id:1n,connection_id:2n,resource_id:'3',event_type:'product.updated',payload:{kind:'product',occurredAt:'2026-09-19T00:00:00Z'},attempts:0};
 const tx={$queryRaw:vi.fn(async(s:TemplateStringsArray)=>{
  const sql=s.join('?');if(sql.includes('supplier_webhook_events'))return [event];
  if(sql.includes('supplier_products'))return [{id:3n,commerce_product_id:4n}];
  if(sql.includes('supplier_connections'))return [{active:1,maintenance:0,sync_enabled:1,status:'connected',sync_claim:null}];
  if(sql.includes('commerce_products'))return [{id:4n}];
  return [];
 }),$executeRaw:vi.fn(async(s:TemplateStringsArray,...values:unknown[])=>{writes.push({sql:s.join('?'),values});return 1;})};
 return {event,tx,writes,db:{$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx),$queryRaw:vi.fn().mockResolvedValue([])} as unknown as CommerceDb};
}
beforeEach(()=>vi.clearAllMocks());
describe('durable supplier GET inbox',()=>{
 it('claims with skip-locked, increments attempts, refetches then marks done',async()=>{
  const f=fixture(),product={externalId:'3'};vi.mocked(adapterForConnection).mockResolvedValue({getProduct:vi.fn().mockResolvedValue(product)} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
  expect(await processNextSupplierEvent(f.db,config)).toBe('done');
  expect(f.tx.$queryRaw.mock.calls[0][0].join('?')).toContain('SKIP LOCKED');
  expect(f.writes[0].sql).toContain('attempts=attempts+1');
  expect(f.writes[0].sql).toContain('claimed_at=UTC_TIMESTAMP(3)');
  expect(f.tx.$queryRaw.mock.calls[0][0].join('?')).toContain("status='pending' AND attempts=0");
  expect(upsertSourceProduct).toHaveBeenCalledWith(expect.anything(),2n,product);
  expect(f.writes.at(-1)?.sql).toContain("status='done'");
 });
 it('retries only authoritative GET failures with sanitized backoff',async()=>{
  const f=fixture();vi.mocked(adapterForConnection).mockRejectedValue(new Error('secret-token'));
  expect(await processNextSupplierEvent(f.db,config)).toBe('failed');
  const failure=f.writes.at(-1)!;expect(failure.sql).toContain('next_attempt_at=');expect(failure.sql).toContain('claim_token=');
  expect(JSON.stringify(failure.values,(_,v)=>typeof v==='bigint'?String(v):v)).not.toContain('secret-token');
 });
 it('fences a late owner before any source write',async()=>{
  const f=fixture();const original=f.tx.$queryRaw.getMockImplementation()!;
  f.tx.$queryRaw.mockImplementation(async(s:TemplateStringsArray)=>s.join('?').includes("status='processing' AND claim_token=")?[]:original(s));
  vi.mocked(adapterForConnection).mockResolvedValue({getProduct:vi.fn().mockResolvedValue({externalId:'3'})} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
  expect(await processNextSupplierEvent(f.db,config)).toBe('lost');expect(upsertSourceProduct).not.toHaveBeenCalled();
  expect(f.writes.some(w=>w.sql.includes("status='done'"))).toBe(false);
 });
 it('reclaims only stale processing rows with bounded attempts using UTC',async()=>{
  const f=fixture();vi.mocked(adapterForConnection).mockRejectedValue(new Error('offline'));await processNextSupplierEvent(f.db,config);
  const claim=f.tx.$queryRaw.mock.calls[0][0].join('?');expect(claim).toContain("status='processing' AND claimed_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)");expect(claim).toContain('attempts<');
 });
 it('confirmed missing product zeros source/commerce availability without unpublishing',async()=>{
  const f=fixture();vi.mocked(adapterForConnection).mockResolvedValue({getProduct:vi.fn().mockResolvedValue(null)} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
  expect(await processNextSupplierEvent(f.db,config)).toBe('done');
  const sql=f.writes.map(w=>w.sql).join(' ');expect(sql).toContain('available=0');expect(sql).toContain('stock_available=0');expect(sql).not.toMatch(/visible=|active=|enabled=/);
 });
 it('caps reconcile at five events',async()=>{
  const f=fixture();vi.mocked(adapterForConnection).mockRejectedValue(new Error('offline'));
  const result=await reconcileSuppliers(f.db,config);
  expect(result.failed).toBe(5);expect(adapterForConnection).toHaveBeenCalledTimes(5);
  expect(Object.values(result).every(n=>typeof n==='number')).toBe(true);
 });
});
