import {describe,expect,it,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import {hideCatalogProduct,removeCatalogProduct,updateCatalogProductSale} from '@/lib/suppliers/catalog-admin';

const sqlText=(sql:unknown)=>Array.isArray(sql)?sql.join('?'):(sql as {sql?:string})?.sql||'';
const managed={
  id:1n,revision:4,commerce_product_id:90n,public_price_minor:2500,unit_cost_minor:1000,
  selling_price_minor:2400,pricing_policy:'manual',discount_minor:0,discount_bps:0,
  minimum_price_minor:2000,minimum_margin_minor:100,active:0,visible:0,featured:0,
};
const source={...managed,connection_id:4n,supplier_id:2n,name:'قهوة عربية',sku:'COFFEE-1',quantity:5,available:1,variants:[],options:[]};

function database(history={orders:0n,allocations:0n}){
 const query=vi.fn(async(sql:unknown)=>{
  const text=sqlText(sql);
  if(text.includes('COUNT(*) FROM commerce_order_items'))return [history];
  if(text.includes('SELECT s.active,p.maintenance'))return [{active:1,maintenance:0,status:'connected'}];
  if(text.includes('SELECT * FROM supplier_products'))return [source];
  if(text.includes('SELECT commerce_product_id FROM supplier_products'))return [{commerce_product_id:90n}];
  if(text.includes('SELECT id FROM commerce_products'))return [{id:90n}];
  if(text.includes('FROM supplier_products'))return [managed];
  return [];
 });
 const execute=vi.fn(async(..._args:unknown[])=>1);
 const audit=vi.fn(async()=>({}));
 const tx={$queryRaw:query,$executeRaw:execute,admin_log:{create:audit}};
 const transaction=vi.fn(async(run:(client:unknown)=>Promise<unknown>)=>run(tx));
 return {db:{$transaction:transaction} as unknown as CommerceDb,query,execute,audit,transaction};
}

describe('supplier catalog management backend',()=>{
 it('uses the supplier price as the source-mode sale price while preserving hidden state',async()=>{
  const d=database();
  await expect(updateCatalogProductSale(d.db,{key:'p_1',revision:4,mode:'source',selling:''},7n)).resolves.toEqual({updated:true});
  const writes=d.execute.mock.calls.map(([sql,...values])=>({sql:sqlText(sql),values}));
  const commerce=writes.find(write=>write.sql.includes('UPDATE commerce_products SET title'))!;
  expect(commerce.values).toContain(2500);
  expect(commerce.values).toContain(0);
  const sourceWrite=writes.find(write=>write.sql.includes('UPDATE supplier_products SET commerce_product_id'))!;
  expect(sourceWrite.values).toContain('source');
  expect(sourceWrite.values).toContain(2500);
  expect(d.audit).toHaveBeenCalledTimes(1);
 });

 it('hides both the Trbhh product and imported mapping immediately without removing the source',async()=>{
  const d=database();
  await expect(hideCatalogProduct(d.db,{key:'p_1',revision:4},7n)).resolves.toEqual({hidden:true});
  const writes=d.execute.mock.calls.map(([sql])=>sqlText(sql));
  expect(writes).toContainEqual(expect.stringContaining('UPDATE commerce_products SET enabled=0,visible=0'));
  expect(writes).toContainEqual(expect.stringContaining('UPDATE supplier_products SET active=0,visible=0'));
  expect(writes.some(sql=>sql.includes('DELETE'))).toBe(false);
  expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({note:expect.stringContaining('source_catalog_preserved=1')})}));
 });

 it('removes only the Trbhh copy after an explicit confirmation and leaves the source re-addable',async()=>{
  const d=database();
  await expect(removeCatalogProduct(d.db,{key:'p_1',revision:4,confirmed:true},7n)).resolves.toEqual({removed:true});
  const writes=d.execute.mock.calls.map(([sql])=>sqlText(sql));
  expect(writes).toEqual([
   expect.stringContaining('DELETE FROM commerce_product_suppliers'),
   expect.stringContaining('UPDATE supplier_products SET commerce_product_id=NULL'),
   expect.stringContaining('DELETE FROM commerce_products'),
  ]);
  expect(writes[1]).toContain("pricing_policy='source'");
  expect(writes.some(sql=>sql.includes('DELETE FROM supplier_products'))).toBe(false);
 });

 it('refuses removal when orders exist and performs no writes',async()=>{
  const d=database({orders:1n,allocations:0n});
  await expect(removeCatalogProduct(d.db,{key:'p_1',revision:4,confirmed:true},7n)).rejects.toThrow('catalog_remove_history');
  expect(d.execute).not.toHaveBeenCalled();
  expect(d.audit).not.toHaveBeenCalled();
 });
});
