import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import {checkedMoney,parseSar} from '@/lib/commerce/money';
import {saveProductControlsInTransaction} from './admin';
import {calculatePricing} from './pricing';
import {CATALOG_PAGE_SIZE,CATALOG_SELECTION_LIMIT,type CatalogSearch,type CatalogPage,type CatalogProduct,type CatalogDetail,type CatalogSelection,type CatalogReview,type CatalogApproval,type CatalogSaleUpdate,type CatalogRemoval} from './catalog-selection';

type Reader=Pick<CommerceDb,'$queryRaw'>;
type Row={id:bigint;revision:number;supplier_id:bigint;connection_id:bigint;commerce_product_id:bigint|null;name:string;sku:string;supplier_name:string;images:unknown;public_price_minor:number;unit_cost_minor:number|null;selling_price_minor:number|null;pricing_policy:string;discount_minor:number;discount_bps:number;minimum_price_minor:number;minimum_margin_minor:number;quantity:number|null;available:number;active:number;visible:number;featured:number;last_sync_at:Date|null;source_updated_at:Date|null;supplier_active:number;maintenance:number;profile_mode:string;connection_status:string;connection_provider:string;profile_provider:string;currency:string;description?:string;brand?:string;categories?:unknown;options?:unknown;variants?:unknown;has_options?:number;commerce_visible:number|null;commerce_enabled:number|null;commerce_approved:number|null};
const fields=Prisma.sql`p.id,p.revision,p.supplier_id,p.connection_id,p.commerce_product_id,p.name,p.sku,s.name AS supplier_name,p.public_price_minor,p.unit_cost_minor,p.selling_price_minor,p.pricing_policy,p.discount_minor,p.discount_bps,p.minimum_price_minor,p.minimum_margin_minor,p.quantity,p.available,p.active,p.visible,p.featured,p.last_sync_at,p.source_updated_at,p.currency,s.active AS supplier_active,ip.maintenance,ip.mode AS profile_mode,c.status AS connection_status,c.provider AS connection_provider,ip.provider AS profile_provider,cp.visible AS commerce_visible,cp.enabled AS commerce_enabled,cp.approved AS commerce_approved`;
const cardFields=Prisma.sql`${fields},JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(p.images,'$[0]'))) AS images,(JSON_LENGTH(p.options)>0 OR JSON_LENGTH(p.variants)>0) AS has_options`;
const joins=Prisma.sql`FROM supplier_products p JOIN commerce_suppliers s ON s.id=p.supplier_id JOIN supplier_connections c ON c.id=p.connection_id AND c.supplier_id=p.supplier_id JOIN supplier_integration_profiles ip ON ip.supplier_id=p.supplier_id LEFT JOIN commerce_products cp ON cp.id=p.commerce_product_id`;
const TTL=10*60*1000;
function keyId(value:unknown,prefix='p_'):bigint{
 if(typeof value!=='string'||!new RegExp('^'+prefix+'[1-9]\\d{0,14}$').test(value))throw Error('catalog_invalid');return BigInt(value.slice(prefix.length));
}
function selection(input:unknown):CatalogSelection[]{
 if(!Array.isArray(input)||!input.length||input.length>CATALOG_SELECTION_LIMIT)throw Error('catalog_selection');
 const seen=new Set<string>();
 return input.map(value=>{if(!value||typeof value!=='object')throw Error('catalog_selection');keyId(value.key);if(!Number.isSafeInteger(value.revision)||value.revision<0||seen.has(value.key))throw Error('catalog_selection');seen.add(value.key);return {key:value.key,revision:value.revision};}).sort((a,b)=>keyId(a.key)<keyId(b.key)?-1:1);
}
function list(value:unknown):unknown[]{
 let parsed=value;if(typeof value==='string'){if(value.length>2000000)throw Error('catalog_data');try{parsed=JSON.parse(value);}catch{throw Error('catalog_data');}}
 if(!Array.isArray(parsed)||parsed.length>1000)throw Error('catalog_data');return parsed;
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('catalog_data');return value as Record<string,unknown>;}
function plain(value:unknown,max=15000,paragraphs=false):string{
 if(typeof value!=='string')return '';
 const entities:Record<string,string>={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
 const source=value.slice(0,200000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
 const readable=paragraphs?source.replace(/\r\n?/g,'\n').replace(/<\/?(?:p|div|li|h[1-6]|br)\b[^>]*>/gi,'\n'):source;
 const decoded=readable
  .replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi,(_all,entity:string)=>{if(entity[0]!=='#')return entities[entity.toLowerCase()]||'';const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';})
  .replace(/<[^>]*>/g,' ');
 return (paragraphs?decoded.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g,' ').replace(/[^\S\n]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n'):decoded.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ')).trim().slice(0,max);
}
function images(value:unknown):string[]{
 return [...new Set(list(value).flatMap(raw=>{if(typeof raw!=='string'||raw.length>2048)return [];try{const url=new URL(raw),host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port||!(host==='cdn.salla.sa'||host.endsWith('.cdn.salla.sa')||host==='salla-dev.s3.eu-central-1.amazonaws.com'))return [];url.hash='';return [url.href];}catch{return [];}}))];
}
function date(value:Date|null):string|null{return value instanceof Date&&Number.isFinite(value.getTime())?value.toISOString():null;}
function eligible(row:Row):boolean{return row.connection_provider==='salla'&&row.profile_provider==='salla'&&row.profile_mode==='live'&&row.connection_status==='connected'&&row.supplier_active===1&&row.maintenance===0;}
function product(row:Row):CatalogProduct{
 const linked=row.commerce_product_id!==null;
 let status:CatalogProduct['status']=linked?'added_hidden':'imported',statusLabel=linked?'مضاف ومخفي':'جاهز للاختيار';
 if(linked&&row.visible===1&&row.active===1&&row.commerce_visible===1&&row.commerce_enabled===1&&row.commerce_approved===1){status='published';statusLabel='منشور';}
 else if(!eligible(row)){status='disconnected';statusLabel=row.connection_status!=='connected'?'الاتصال غير متاح':'المورد غير متاح';}
 else if(!linked&&(row.available!==1||row.quantity===0)){status='unavailable';statusLabel='غير متوفر حاليًا · يمكن إضافته مخفيًا';}
 const pricingPolicy=['manual','source','fixed_discount','percent_discount'].includes(row.pricing_policy)?row.pricing_policy as CatalogProduct['pricingPolicy']:'source';
 return {key:'p_'+row.id,revision:row.revision,name:plain(row.name,255),sku:plain(row.sku,191),supplierKey:'s_'+row.supplier_id,supplierName:plain(row.supplier_name,255),image:images(row.images)[0]||null,priceMinor:checkedMoney(row.public_price_minor),costMinor:row.unit_cost_minor===null?null:checkedMoney(row.unit_cost_minor),sellingMinor:row.selling_price_minor===null?null:checkedMoney(row.selling_price_minor),pricingPolicy,minimumPriceMinor:checkedMoney(row.minimum_price_minor),minimumMarginMinor:checkedMoney(row.minimum_margin_minor),quantity:row.quantity,available:row.available===1,status,statusLabel,canSelect:!linked&&eligible(row),canManage:linked,active:row.active===1,visible:row.visible===1,hasOptions:row.has_options!==undefined?Number(row.has_options)!==0:list(row.options??[]).length>0||list(row.variants??[]).length>0,lastSyncAt:date(row.last_sync_at)};
}
function searchInput(input:CatalogSearch):CatalogSearch{
 if(!input||typeof input.query!=='string'||input.query.length>120||/[\u0000-\u001f\u007f]/.test(input.query)||typeof input.supplierKey!=='string'||!Number.isInteger(input.page)||input.page<1||input.page>10000)throw Error('catalog_invalid');
 if(input.supplierKey)keyId(input.supplierKey,'s_');return {query:input.query.trim(),supplierKey:input.supplierKey,page:input.page};
}
/** Read-only imported catalog; authorization belongs to the page/actions before this reader. */
export async function loadCatalog(db:Reader,input:CatalogSearch):Promise<CatalogPage>{
 const query=searchInput(input),filter=query.supplierKey?Prisma.sql`AND p.supplier_id=${keyId(query.supplierKey,'s_')}`:Prisma.empty;
 const [rows,suppliers]=await Promise.all([
  db.$queryRaw<Row[]>(Prisma.sql`SELECT ${cardFields} ${joins} WHERE c.provider='salla' AND ip.provider='salla' AND ip.mode='live' ${filter} AND (${query.query}='' OR LOCATE(LOWER(${query.query}),LOWER(p.name))>0 OR LOCATE(LOWER(${query.query}),LOWER(p.sku))>0) ORDER BY p.id DESC LIMIT ${CATALOG_PAGE_SIZE+1} OFFSET ${(query.page-1)*CATALOG_PAGE_SIZE}`),
  db.$queryRaw<{id:bigint;name:string}[]>`SELECT s.id,s.name FROM commerce_suppliers s JOIN supplier_integration_profiles ip ON ip.supplier_id=s.id WHERE ip.provider='salla' AND ip.mode='live' ORDER BY s.name,s.id LIMIT 200`,
 ]);
 return {...query,products:rows.slice(0,CATALOG_PAGE_SIZE).map(product),suppliers:suppliers.map(row=>({key:'s_'+row.id,name:plain(row.name,255)})),hasNext:rows.length>CATALOG_PAGE_SIZE};
}
export async function loadCatalogDetail(db:Reader,key:string):Promise<CatalogDetail>{
 const id=keyId(key),[row]=await db.$queryRaw<Row[]>(Prisma.sql`SELECT ${fields},p.images,p.description,p.brand,p.categories,p.options,p.variants ${joins} WHERE p.id=${id} AND c.provider='salla' AND ip.provider='salla' AND ip.mode='live' LIMIT 1`);
 if(!row||row.id!==id)throw Error('catalog_missing');
 const options=list(row.options).map(value=>{const v=object(value);return {name:plain(v.name,255),values:list(v.values).map(value=>plain(value,255))};});
 const variants=list(row.variants).map(value=>{const v=object(value),selected:Record<string,string>={};for(const [name,text] of Object.entries(object(v.options)).slice(0,1000))Object.defineProperty(selected,plain(name,255),{value:plain(text,255),enumerable:true});return {name:plain(v.name,255),sku:plain(v.sku,191),priceMinor:v.publicPriceMinor===null?null:checkedMoney(v.publicPriceMinor as number),quantity:typeof v.quantity==='number'&&Number.isSafeInteger(v.quantity)&&v.quantity>=0?v.quantity:null,available:v.available===true,options:selected};});
 return {...product(row),description:plain(row.description,65535,true),images:images(row.images),brand:plain(row.brand,255),categories:list(row.categories).map(value=>plain(object(value).name,255)),options,variants,sourceUpdatedAt:date(row.source_updated_at)};
}
async function selectedRows(db:Reader,selected:CatalogSelection[],lock=false):Promise<Row[]>{
 const ids=selected.map(item=>keyId(item.key));
 if(lock){
  // All source rows first, in numeric order, then supplier/connection fences.
  // Sync takes product before connection; interleaving these locks by product
  // would deadlock a multi-item approval with a normal source-price update.
  for(const item of selected){
   const [locked]=await db.$queryRaw<{id:bigint;revision:number;commerce_product_id:bigint|null}[]>`SELECT id,revision,commerce_product_id FROM supplier_products WHERE id=${keyId(item.key)} FOR UPDATE`;
   if(!locked||locked.id!==keyId(item.key)||locked.revision!==item.revision||locked.commerce_product_id!==null)throw Error('catalog_stale');
  }
 }
 const rows=await db.$queryRaw<Row[]>(Prisma.sql`SELECT ${cardFields} ${joins} WHERE p.id IN (${Prisma.join(ids)}) ORDER BY p.id ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`);
 const byKey=new Map(rows.map(row=>['p_'+row.id,row]));
 if(rows.length!==selected.length||byKey.size!==rows.length)throw Error('catalog_stale');
 return selected.map(item=>{const row=byKey.get(item.key);if(!row||row.revision!==item.revision||row.commerce_product_id!==null||!eligible(row)||row.currency!=='SAR')throw Error('catalog_stale');return row;});
}
function signingKey(secret:string):Buffer{if(!/^[a-f0-9]{64}$/i.test(secret))throw Error('catalog_config');return createHmac('sha256',Buffer.from(secret,'hex')).update('trbhh:supplier-catalog-review:v1').digest();}
type ReviewPayload={version:1;admin:string;issued:number;expires:number;selection:CatalogSelection[]};
function issue(selected:CatalogSelection[],adminId:bigint,secret:string,now:number):{token:string;expiresAt:string}{
 const data:ReviewPayload={version:1,admin:String(adminId),issued:now,expires:now+TTL,selection:selected},body=Buffer.from(JSON.stringify(data)).toString('base64url');
 return {token:body+'.'+createHmac('sha256',signingKey(secret)).update(body).digest('hex'),expiresAt:new Date(data.expires).toISOString()};
}
function verify(token:unknown,adminId:bigint,secret:string,now:number):CatalogSelection[]{
 const key=signingKey(secret);
 try{
  if(typeof token!=='string'||token.length>16000)throw Error();const [body,signature,...extra]=token.split('.');
  if(extra.length||!/^[A-Za-z0-9_-]+$/.test(body)||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(createHmac('sha256',key).update(body).digest(),Buffer.from(signature,'hex')))throw Error();
  const data=JSON.parse(Buffer.from(body,'base64url').toString()) as ReviewPayload;
  if(data.version!==1||data.admin!==String(adminId)||!Number.isSafeInteger(data.issued)||!Number.isSafeInteger(data.expires)||data.expires-data.issued!==TTL||data.issued>now||data.expires<=now)throw Error();
  return selection(data.selection);
 }catch{throw Error('catalog_review_expired');}
}
export async function reviewCatalogSelection(db:Reader,input:CatalogSelection[],adminId:bigint,secret:string,now=Date.now()):Promise<CatalogReview>{
 const selected=selection(input);signingKey(secret);const rows=await selectedRows(db,selected);
 return {...issue(selected,adminId,secret,now),products:rows.map(product)};
}
export async function approveCatalogSelection(db:CommerceDb,input:CatalogApproval,adminId:bigint,secret:string,now=Date.now()):Promise<{added:number}>{
 if(!input||input.confirmed!==true)throw Error('catalog_confirmation');
 const selected=selection(input.products),reviewed=verify(input.token,adminId,secret,now);
 if(JSON.stringify(selected)!==JSON.stringify(reviewed))throw Error('catalog_stale');
 const prices=new Map(input.products.map(value=>{if(typeof value.cost!=='string'||typeof value.selling!=='string')throw Error('catalog_price');try{return [value.key,{costMinor:parseSar(value.cost),sellingMinor:parseSar(value.selling)}] as const;}catch{throw Error('catalog_price');}}));
 return db.$transaction(async tx=>{
  // Lock and validate the complete batch before any mappings are written.
  // Competing approvals serialize; replay fails after revision/mapping changes.
  const rows=await selectedRows(tx,selected,true);
  const controls=rows.map(row=>{const amounts=prices.get('p_'+row.id)!,policy=amounts.sellingMinor===row.public_price_minor?'source' as const:'manual' as const;calculatePricing({publicMinor:row.public_price_minor,...amounts,policy,minimumPriceMinor:row.minimum_price_minor,minimumMarginMinor:row.minimum_margin_minor});return {id:row.id,revision:row.revision,policy,...amounts,discountMinor:0,discountBps:0,minimumPriceMinor:row.minimum_price_minor,minimumMarginMinor:row.minimum_margin_minor,active:false,visible:false,featured:false};});
  for(const control of controls)await saveProductControlsInTransaction(tx,control,adminId);
  return {added:controls.length};
 },{isolationLevel:'ReadCommitted',timeout:30000});
}

type ManagedRow={id:bigint;revision:number;commerce_product_id:bigint|null;public_price_minor:number;unit_cost_minor:number|null;selling_price_minor:number|null;pricing_policy:string;discount_minor:number;discount_bps:number;minimum_price_minor:number;minimum_margin_minor:number;active:number;visible:number;featured:number};
function managedSelection(input:CatalogSelection):{id:bigint;revision:number}{
 if(!input||typeof input!=='object'||!Number.isSafeInteger(input.revision)||input.revision<0)throw Error('catalog_invalid');
 return {id:keyId(input.key),revision:input.revision};
}
async function managedRow(tx:Prisma.TransactionClient,input:CatalogSelection):Promise<ManagedRow>{
 const parsed=managedSelection(input);
 const [row]=await tx.$queryRaw<ManagedRow[]>`SELECT id,revision,commerce_product_id,public_price_minor,unit_cost_minor,selling_price_minor,pricing_policy,discount_minor,discount_bps,minimum_price_minor,minimum_margin_minor,active,visible,featured FROM supplier_products WHERE id=${parsed.id}`;
 if(!row||row.revision!==parsed.revision||row.commerce_product_id===null)throw Error('catalog_stale');
 return row;
}

/** Edit only the selling rule from the visual catalog; all other controls are preserved. */
export async function updateCatalogProductSale(db:CommerceDb,input:CatalogSaleUpdate,adminId:bigint):Promise<{updated:true}>{
 if(!input||!['source','manual'].includes(input.mode)||typeof input.selling!=='string')throw Error('catalog_price');
 return db.$transaction(async tx=>{
  const row=await managedRow(tx,input);
  if(row.unit_cost_minor===null)throw Error('catalog_cost_missing');
  let sellingMinor:number;
  try{sellingMinor=input.mode==='source'?row.public_price_minor:parseSar(input.selling);}catch{throw Error('catalog_price');}
  await saveProductControlsInTransaction(tx,{id:row.id,revision:row.revision,policy:input.mode,costMinor:row.unit_cost_minor,sellingMinor,discountMinor:0,discountBps:0,minimumPriceMinor:row.minimum_price_minor,minimumMarginMinor:row.minimum_margin_minor,active:row.active===1,visible:row.visible===1,featured:row.featured===1},adminId);
  return {updated:true as const};
 },{isolationLevel:'ReadCommitted',timeout:30000});
}

async function lockManagedRow(tx:Prisma.TransactionClient,input:CatalogSelection):Promise<ManagedRow>{
 const parsed=managedSelection(input);
 const [lookup]=await tx.$queryRaw<{commerce_product_id:bigint|null}[]>`SELECT commerce_product_id FROM supplier_products WHERE id=${parsed.id}`;
 if(!lookup?.commerce_product_id)throw Error('catalog_stale');
 await tx.$queryRaw`SELECT id FROM commerce_products WHERE id=${lookup.commerce_product_id} FOR UPDATE`;
 const [row]=await tx.$queryRaw<ManagedRow[]>`SELECT id,revision,commerce_product_id,public_price_minor,unit_cost_minor,selling_price_minor,pricing_policy,discount_minor,discount_bps,minimum_price_minor,minimum_margin_minor,active,visible,featured FROM supplier_products WHERE id=${parsed.id} FOR UPDATE`;
 if(!row||row.revision!==parsed.revision||row.commerce_product_id!==lookup.commerce_product_id)throw Error('catalog_stale');
 return row;
}

/** Reversible emergency action available next to every mapped catalog product. */
export async function hideCatalogProduct(db:CommerceDb,input:CatalogSelection,adminId:bigint):Promise<{hidden:true}>{
 return db.$transaction(async tx=>{
  const row=await lockManagedRow(tx,input);
  await tx.$executeRaw`UPDATE commerce_products SET enabled=0,visible=0,updated_at=CURRENT_TIMESTAMP(3) WHERE id=${row.commerce_product_id}`;
  await tx.$executeRaw`UPDATE supplier_products SET active=0,visible=0,revision=revision+1 WHERE id=${row.id}`;
  await tx.admin_log.create({data:{admin_id:adminId,action:'إخفاء منتج مورد',target:String(row.id),note:'visible=0;active=0;source_catalog_preserved=1'}});
  return {hidden:true as const};
 },{isolationLevel:'ReadCommitted',timeout:30000});
}

/** Remove only the Trbhh mapping. Source data remains available for a later manual re-add. */
export async function removeCatalogProduct(db:CommerceDb,input:CatalogRemoval,adminId:bigint):Promise<{removed:true}>{
 if(input?.confirmed!==true)throw Error('catalog_remove_confirmation');
 return db.$transaction(async tx=>{
  const row=await lockManagedRow(tx,input),commerceId=row.commerce_product_id!;
  const [history]=await tx.$queryRaw<{orders:bigint;allocations:bigint}[]>`SELECT (SELECT COUNT(*) FROM commerce_order_items WHERE product_id=${commerceId}) AS orders,(SELECT COUNT(*) FROM supplier_reservation_allocations WHERE commerce_product_id=${commerceId}) AS allocations`;
  if(!history||history.orders>0n||history.allocations>0n)throw Error('catalog_remove_history');
  await tx.$executeRaw`DELETE FROM commerce_product_suppliers WHERE product_id=${commerceId}`;
  await tx.$executeRaw`UPDATE supplier_products SET commerce_product_id=NULL,selling_price_minor=NULL,pricing_policy='source',discount_minor=0,discount_bps=0,active=0,visible=0,featured=0,revision=revision+1 WHERE id=${row.id}`;
  await tx.$executeRaw`DELETE FROM commerce_products WHERE id=${commerceId}`;
  await tx.admin_log.create({data:{admin_id:adminId,action:'حذف منتج مورد من تربح',target:String(row.id),note:`commerce_product=${commerceId};source_catalog_preserved=1;history=0`}});
  return {removed:true as const};
 },{isolationLevel:'ReadCommitted',timeout:30000});
}
