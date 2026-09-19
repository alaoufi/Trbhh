import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from '@/lib/suppliers/config';
import type {SupplierProduct} from '@/lib/suppliers/types';
vi.mock('@/lib/suppliers/schema',()=>({assertSupplierSchemaReady:vi.fn()}));
vi.mock('@/lib/suppliers/registry',()=>({adapterForConnection:vi.fn()}));
import {adapterForConnection} from '@/lib/suppliers/registry';
import {upsertSourceProduct} from '@/lib/suppliers/catalog';
import {syncConnection} from '@/lib/suppliers/sync';
const product:SupplierProduct={externalId:'3',sku:'s',name:'Name',description:'plain',images:[],variants:[],options:[],categories:[],brand:'',publicPriceMinor:5000,currency:'SAR',quantity:20,available:true,sourceUpdatedAt:null};
function fixture(existing=false){
  const writes:{sql:string;values:unknown[]}[]=[];
  const gate={supplier_id:2n,provider:'salla',status:'connected',active:1,maintenance:0,sync_enabled:1,sync_claim:null as string|null};
  const row={id:4n,supplier_id:2n,commerce_product_id:existing?9n:null,public_price_minor:4500,unit_cost_minor:4000,selling_price_minor:4700,source_updated_at:null as Date|null};
  const tx={$queryRaw:vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
    const sql=strings.join('?');
    if(sql.includes('supplier_connections'))return [gate];
    if(sql.includes('FROM supplier_products'))return existing?[row]:[];
    if(sql.includes('FROM commerce_products'))return [{id:9n,stock_available:10,stock_reserved:3}];
    if(sql.includes('SUM('))return [{quantity:12n}];
    if(sql.includes('LAST_INSERT_ID'))return [{id:4n}];
    throw new Error('unexpected query '+sql+values.length);
  }),$executeRaw:vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
    const sql=strings.join('?');writes.push({sql,values});
    if(sql.includes('SET sync_claim=')&&values[0])gate.sync_claim=String(values[0]);
    return 1;
  })};
  const db={$transaction:vi.fn(async(fn:(tx:unknown)=>unknown)=>fn(tx)),$queryRaw:tx.$queryRaw} as unknown as CommerceDb;
  return {db,tx,writes,gate,row};
}
beforeEach(()=>vi.clearAllMocks());
describe('supplier source-only persistence',()=>{
  it('inserts hidden/unmapped with no provider cost and source history',async()=>{
    const f=fixture();await upsertSourceProduct(f.db,1n,product);
    const insert=f.writes.find(w=>w.sql.includes('INSERT INTO supplier_products'))!;
    expect(insert.sql).not.toMatch(/unit_cost_minor|selling_price_minor|commerce_product_id/);
    expect(f.writes.some(w=>w.sql.includes('supplier_price_history'))).toBe(true);
  });
  it('preserves admin fields and caps mapped available stock after local obligations',async()=>{
    const f=fixture(true);await upsertSourceProduct(f.db,1n,product);
    const update=f.writes.find(w=>w.sql.includes('UPDATE supplier_products'))!;
    expect(update.sql).not.toMatch(/active=|visible=|featured=|unit_cost_minor=|selling_price_minor=|commerce_product_id=/);
    expect(f.writes.find(w=>w.sql.includes('UPDATE commerce_products'))?.values[0]).toBe(5);
  });
  it.each(['active','sync_enabled'])('blocks disabled %s',async key=>{
    const f=fixture();Object.assign(f.gate,{[key]:0});await expect(upsertSourceProduct(f.db,1n,product)).rejects.toThrow('supplier_sync_unavailable');expect(f.writes).toHaveLength(0);
  });
  it('blocks maintenance and an unrelated sync owner',async()=>{
    const f=fixture();f.gate.maintenance=1;await expect(upsertSourceProduct(f.db,1n,product)).rejects.toThrow();
    f.gate.maintenance=0;f.gate.sync_claim='other';await expect(upsertSourceProduct(f.db,1n,product)).rejects.toThrow();
  });
  it('never increases mapped stock even when source is replenished',async()=>{
    const f=fixture(true);await upsertSourceProduct(f.db,1n,{...product,quantity:100});
    expect(f.writes.find(w=>w.sql.includes('UPDATE commerce_products'))?.values[0]).toBe(10);
  });
  it('closes mapped stock when a previously simple source gains variants',async()=>{
    const f=fixture(true);await upsertSourceProduct(f.db,1n,{...product,variants:[{externalId:'v',sku:'v',name:'size',publicPriceMinor:5000,quantity:10,available:true,options:{}}]});
    expect(f.writes.find(w=>w.sql.includes('UPDATE commerce_products'))?.values[0]).toBe(0);
  });
  it('undated hidden source still closes known-dated product without replacing price/date',async()=>{
    const f=fixture(true);f.row.source_updated_at=new Date('2026-09-19T00:00:00Z');
    await upsertSourceProduct(f.db,1n,{...product,available:false,quantity:0});
    expect(f.writes.find(w=>w.sql.includes('UPDATE commerce_products'))?.values[0]).toBe(0);
    const update=f.writes.find(w=>w.sql.includes('UPDATE supplier_products'))!;
    expect(update.sql).not.toMatch(/source_updated_at=|public_price_minor=/);
    expect(update.sql).toContain('available=');
  });
  it.each([null,0])('unknown or exhausted stock %s closes availability',async quantity=>{
    const f=fixture(true);await upsertSourceProduct(f.db,1n,{...product,quantity});
    expect(f.writes.find(w=>w.sql.includes('UPDATE commerce_products'))?.values[0]).toBe(0);
  });
  it('uses fresh reads after obtaining product lock so committed settlement is included',async()=>{
    const f=fixture(true);await upsertSourceProduct(f.db,1n,product);
    expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'ReadCommitted'});
  });
  it('does not append duplicate source-price history on an unchanged price',async()=>{
    const f=fixture(true);f.row.public_price_minor=5000;await upsertSourceProduct(f.db,1n,product);
    expect(f.writes.some(w=>w.sql.includes('INSERT INTO supplier_price_history'))).toBe(false);
  });
});
describe('bounded sync claims',()=>{
  const config={} as SupplierConfig;
  it('imports pages under one durable claim and marks success only on completion',async()=>{
    const f=fixture();const getProducts=vi.fn().mockResolvedValueOnce({products:[product],nextCursor:'2'}).mockResolvedValueOnce({products:[],nextCursor:null});
    vi.mocked(adapterForConnection).mockResolvedValue({getProducts} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
    expect(await syncConnection(f.db,1n,config)).toEqual({imported:1});
    expect(getProducts).toHaveBeenCalledTimes(2);
    expect(f.writes.filter(w=>w.sql.includes('sync_claimed_at=')&&!w.sql.includes('sync_claimed_at=NULL')).every(w=>w.sql.includes('sync_claimed_at=UTC_TIMESTAMP(3)'))).toBe(true);
    expect(f.writes.some(w=>w.sql.includes('last_sync_at=CURRENT_TIMESTAMP'))).toBe(true);
  });
  it('records sanitized partial failure and releases only its own claim',async()=>{
    const f=fixture();vi.mocked(adapterForConnection).mockResolvedValue({getProducts:vi.fn().mockRejectedValue(new Error('token=secret'))} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
    await expect(syncConnection(f.db,1n,config)).rejects.toThrow('supplier_sync_failed');
    expect(JSON.stringify(f.writes,(_,v)=>typeof v==='bigint'?String(v):v)).not.toContain('secret');
    expect(f.writes.some(w=>w.sql.includes('sync_claim=NULL')&&w.sql.includes('sync_claim='))).toBe(true);
  });
  it('rejects an active owner before any API call',async()=>{
    const f=fixture();f.gate.sync_claim='owner';
    await expect(syncConnection(f.db,1n,config)).rejects.toThrow('supplier_sync_busy');
    expect(adapterForConnection).not.toHaveBeenCalled();
  });
  it('detects repeated pagination and never reports partial success',async()=>{
    const f=fixture();const getProducts=vi.fn().mockResolvedValue({products:[],nextCursor:'2'});
    vi.mocked(adapterForConnection).mockResolvedValue({getProducts} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
    await expect(syncConnection(f.db,1n,config)).rejects.toThrow('supplier_sync_pagination');
    expect(getProducts).toHaveBeenCalledTimes(2);
    expect(f.writes.some(w=>w.sql.includes('SET last_sync_at=CURRENT_TIMESTAMP'))).toBe(false);
  });
  it('bounds a single run at 100 pages and records explicit truncation failure',async()=>{
    const f=fixture();let page=1;const getProducts=vi.fn(async()=>({products:[],nextCursor:String(++page)}));
    vi.mocked(adapterForConnection).mockResolvedValue({getProducts} as unknown as Awaited<ReturnType<typeof adapterForConnection>>);
    await expect(syncConnection(f.db,1n,config)).rejects.toThrow('supplier_sync_page_limit');
    expect(getProducts).toHaveBeenCalledTimes(100);
  });
});
