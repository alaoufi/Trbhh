import {describe,it,expect,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {CatalogApproval} from '@/lib/suppliers/catalog-selection';
import {loadCatalog,loadCatalogDetail,reviewCatalogSelection,approveCatalogSelection} from '@/lib/suppliers/catalog-admin';

const secret='ab'.repeat(32),admin=7n,now=Date.parse('2026-09-21T12:00:00Z');
function row(id=1n){return {id,revision:3,supplier_id:2n,connection_id:4n,commerce_product_id:null,name:'قهوة عربية',sku:'COFFEE-1',supplier_name:'متجر المورد',images:['https://cdn.salla.sa/test.jpg'],public_price_minor:2500,unit_cost_minor:null,selling_price_minor:null,minimum_price_minor:2000,minimum_margin_minor:100,quantity:0,available:0,active:0,visible:0,featured:0,last_sync_at:new Date(now),source_updated_at:new Date(now),supplier_active:1,maintenance:0,connection_status:'connected',connection_provider:'salla',profile_provider:'salla',currency:'SAR',description:'<p>قهوة &amp; هيل</p><script>secret()</script>',brand:'محلي',categories:[{externalId:'private-category',name:'قهوة'}],options:[{externalId:'private-option',name:'الحجم',values:['كبير']}],variants:[{externalId:'private-variant',name:'كبير',sku:'COFFEE-L',publicPriceMinor:3000,quantity:2,available:true,options:{الحجم:'كبير'}}],commerce_visible:null,commerce_enabled:null,commerce_approved:null};}
type Row=ReturnType<typeof row>;
const text=(sql:unknown)=>Array.isArray(sql)?sql.join('?'):(sql as {sql?:string})?.sql||'';
function database(initial:Row[]){
 let rows=structuredClone(initial),writes=0;
 const query=vi.fn(async (sql:unknown,...values:unknown[])=>{
  const q=text(sql);
  if(q.includes('SELECT s.id,s.name'))return [{id:2n,name:'متجر المورد'}];
  if(q.includes('SELECT LAST_INSERT_ID'))return [{id:100n+BigInt(writes)}];
  if(q.includes('SELECT commerce_product_id FROM'))return rows.filter(r=>values[0]===r.id).map(r=>({commerce_product_id:r.commerce_product_id}));
  if(q.includes('SELECT id,revision,commerce_product_id FROM'))return rows.filter(r=>values[0]===r.id);
  if(q.includes('SELECT * FROM supplier_products'))return rows.filter(r=>values[0]===r.id);
  if(q.includes('SELECT s.active,p.maintenance'))return [{active:1,maintenance:0,status:'connected',provider:'salla',profile_provider:'salla'}];
  return rows;
 });
 const execute=vi.fn(async(..._args:unknown[])=>{writes++;return 1;});
 const tx={$queryRaw:query,$executeRaw:execute,admin_log:{create:vi.fn(async()=>({}))}};
 const transaction=vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>{const oldWrites=writes;try{return await fn(tx);}catch(error){writes=oldWrites;throw error;}});
 return {db:{$queryRaw:query,$transaction:transaction} as unknown as CommerceDb,query,execute,transaction,rows:()=>rows,replace:(next:Row[])=>{rows=structuredClone(next);},writes:()=>writes};
}
describe('supplier visual catalog backend',()=>{
 it('performs bounded parameterized literal search and never returns provider identifiers',async()=>{
  const d=database([row()]);
  const page=await loadCatalog(d.db,{query:'%_? قهوة',supplierKey:'s_2',page:2});
  expect(page.products[0]).toMatchObject({key:'p_1',supplierName:'متجر المورد',costMinor:null,canSelect:true,quantity:0});
  expect(page.products[0]).not.toHaveProperty('externalId');
  const calls=d.query.mock.calls.map(([sql])=>sql as {sql:string;values:unknown[]});
  const search=calls.find(call=>call.sql?.includes('LOCATE'))!;
  expect(search.sql).not.toContain('%_? قهوة');expect(search.values).toContain('%_? قهوة');expect(search.values).toContain(21);expect(search.values).toContain(20);
  expect(d.execute).not.toHaveBeenCalled();
 });
 it('strips external IDs and unsafe image URLs while returning readable detail',async()=>{
  const product=row();product.images.push('http://127.0.0.1/internal');
  const d=database([product]),detail=await loadCatalogDetail(d.db,'p_1');
  expect(detail.description).toBe('قهوة & هيل');expect(detail.images).toHaveLength(1);
  expect(JSON.stringify(detail)).not.toMatch(/private-category|private-option|private-variant|externalId|secret\(\)/);
 expect(detail.options).toEqual([{name:'الحجم',values:['كبير']}]);expect(detail.variants[0].options).toEqual({الحجم:'كبير'});
 });
 it('keeps the complete stored description and readable paragraph boundaries',async()=>{
  const product=row(),description='أ'.repeat(20000);product.description='<p>'+description+'</p><p>المواصفات</p>';
  const detail=await loadCatalogDetail(database([product]).db,'p_1');expect(detail.description).toBe(description+'\n\nالمواصفات');
 });
 it('review rejects stale, missing, duplicated and already mapped selections without writing',async()=>{
  const d=database([row()]);
  for(const selection of [[{key:'p_1',revision:2}],[{key:'p_2',revision:3}],[{key:'p_1',revision:3},{key:'p_1',revision:3}]])await expect(reviewCatalogSelection(d.db,selection,admin,secret,now)).rejects.toThrow();
  d.replace([{...row(),commerce_product_id:90n} as unknown as Row]);
  await expect(reviewCatalogSelection(d.db,[{key:'p_1',revision:3}],admin,secret,now)).rejects.toThrow();expect(d.execute).not.toHaveBeenCalled();
 });
 it('rejects oversized selections and malformed search or keys before querying',async()=>{
  const d=database([row()]);
  for(const input of [{query:'x'.repeat(121),supplierKey:'',page:1},{query:'',supplierKey:'s_2 OR 1=1',page:1},{query:'',supplierKey:'',page:0},{query:'',supplierKey:'',page:10001}])await expect(loadCatalog(d.db,input)).rejects.toThrow('catalog_invalid');
  await expect(loadCatalogDetail(d.db,'p_1 OR 1=1')).rejects.toThrow('catalog_invalid');
  for(const input of [[],Array.from({length:51},(_,i)=>({key:'p_'+(i+1),revision:0}))])await expect(reviewCatalogSelection(d.db,input,admin,secret,now)).rejects.toThrow('catalog_selection');
  expect(d.query).not.toHaveBeenCalled();
 });
 it('binds short-lived signed review to admin and exact selection and requires explicit confirmation',async()=>{
  const d=database([row()]),review=await reviewCatalogSelection(d.db,[{key:'p_1',revision:3}],admin,secret,now);
  const input={token:review.token,confirmed:true,products:[{key:'p_1',revision:3,cost:'10.00',selling:'25.00'}]};
  const attempts:[CatalogApproval,bigint,number][]=[[{...input,confirmed:false},admin,now],[input,8n,now],[input,admin,now+11*60000],[{...input,token:input.token+'x'},admin,now],[{...input,products:[{...input.products[0],key:'p_2'}]},admin,now]];
  for(const [bad,who,time] of attempts){await expect(approveCatalogSelection(d.db,bad,who,secret,time)).rejects.toThrow();}
  expect(d.transaction).not.toHaveBeenCalled();
 });
 it('requires negotiated cost and existing pricing minima with no partial batch writes',async()=>{
  const d=database([row(),row(2n)]),review=await reviewCatalogSelection(d.db,[{key:'p_1',revision:3},{key:'p_2',revision:3}],admin,secret,now);
  for(const cost of ['', '25.00']){
   await expect(approveCatalogSelection(d.db,{token:review.token,confirmed:true,products:[{key:'p_1',revision:3,cost:'10.00',selling:'25.00'},{key:'p_2',revision:3,cost,selling:'20.00'}]},admin,secret,now)).rejects.toThrow();
   expect(d.writes()).toBe(0);
  }
 });
 it('rejects changed source state after review and imports eligible complex/sold-out items only hidden atomically',async()=>{
  const d=database([row()]),review=await reviewCatalogSelection(d.db,[{key:'p_1',revision:3}],admin,secret,now);
  const input={token:review.token,confirmed:true,products:[{key:'p_1',revision:3,cost:'10.00',selling:'25.00'}]};
  for(const changed of [{revision:4},{connection_status:'disconnected'},{supplier_active:0},{maintenance:1}]){
   d.replace([{...row(),...changed}]);await expect(approveCatalogSelection(d.db,input,admin,secret,now)).rejects.toThrow();expect(d.writes()).toBe(0);
  }
  d.replace([row()]);expect(await approveCatalogSelection(d.db,input,admin,secret,now)).toEqual({added:1});
  const writes=d.execute.mock.calls.map(([sql,...values])=>({sql:text(sql),values}));
  const inserted=writes.find(v=>v.sql.includes('INSERT INTO commerce_products'))!;expect(inserted.values.slice(-2)).toEqual([0,0]);
  const update=writes.find(v=>v.sql.includes('UPDATE supplier_products SET commerce_product_id'))!;expect(update.values.slice(-4,-1)).toEqual([0,0,0]);
  expect(writes.some(v=>/site_settings|supplier_connections|supplier_integration_profiles/.test(v.sql))).toBe(false);
 });
 it('locks all unmapped source products in numeric order before connection fences or writes',async()=>{
  const d=database([row(2n),row(10n)]),review=await reviewCatalogSelection(d.db,[{key:'p_10',revision:3},{key:'p_2',revision:3}],admin,secret,now);
  d.query.mockClear();
  await approveCatalogSelection(d.db,{token:review.token,confirmed:true,products:[{key:'p_10',revision:3,cost:'10',selling:'25'},{key:'p_2',revision:3,cost:'10',selling:'25'}]},admin,secret,now);
  const locks=d.query.mock.calls.filter(([sql])=>text(sql).includes('SELECT id,revision,commerce_product_id'));
  expect(locks.map(([,id])=>id)).toEqual([2n,10n]);
  const fence=d.query.mock.calls.findIndex(([sql])=>text(sql).includes('FOR SHARE'));
  expect(fence).toBe(2);expect(text(d.query.mock.calls[0][0])).not.toContain('JOIN');
  expect(d.transaction).toHaveBeenCalledTimes(1);
 });
});
