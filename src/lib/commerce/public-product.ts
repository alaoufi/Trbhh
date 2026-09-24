import 'server-only';
import {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {assertCommerceSchemaReady} from './schema';
import {parseCjAvailability} from '@/lib/cj/mapping';

export type PublicVariant={key:string;vid:string|null;sku:string|null;name:string;options:string[];attributes:Record<string,string>;image:string|null;priceMinor:number;stock:number;originalPriceMinor:number|null;shippingMinor:number|null;deliveryEstimate:string|null};
export type PublicCommerceProduct={id:string;title:string;priceMinor:number;stock:number;images:string[];description:string;brand:string|null;options:string[];variants:PublicVariant[];requiresVariantSelection:boolean;featured:boolean;saudiShippingAvailable:boolean;deliveryEstimate:string|null;weightLabel:string|null};
type Row={id:bigint;title:string;price_minor:number;stock_available:number;stock_reserved:number;images:unknown;description:string;brand:string;options:unknown;variants:unknown;available:number;quantity:number|null;featured:number;source_id:bigint|null;cj_source_id:bigint|null;cj_availability_json:string|null;cj_details_json:string|null};
function json(value:unknown):unknown{if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return null;}}
function safeImages(value:unknown):string[]{
 const parsed=json(value);if(!Array.isArray(parsed))return[];
 const urls=parsed.filter((v):v is string=>typeof v==='string'&&(v.startsWith('https://')||v.startsWith('/media/')));
 return[...new Set(urls)].slice(0,12);
}
function plain(value:unknown,max:number):string{return typeof value==='string'?value.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';}
function attributes(value:unknown):Record<string,string>{
 if(!value||typeof value!=='object'||Array.isArray(value))return{};
 const out:Record<string,string>={};
 for(const [rawKey,rawValue] of Object.entries(value as Record<string,unknown>)){
  const key=plain(rawKey,100),val=typeof rawValue==='string'||typeof rawValue==='number'||typeof rawValue==='boolean'?plain(String(rawValue),200):'';
  if(!key||!val||/token|secret|password|cost|margin|supplier|api|internal|profit|purchase.?price/i.test(key)||/^(id|vid|sku|barcode|name|variantName(?:En)?|variantKey(?:En)?|variantProperty|image|variantImage|bigImg|bigimg|img|url|available|quantity|stock|stockQuantity|variantSellPrice|sellPrice|priceUsd|publicPriceMinor)$/i.test(key))continue;
  out[key]=val;
 }
 return out;
}
function parseOptionMap(value:unknown):Record<string,string>{
 if(value&&typeof value==='object'&&!Array.isArray(value))return attributes(value);
 if(typeof value!=='string'||!value.trim())return{};
 const out:Record<string,string>={};
 for(const part of value.split(/[;|,\n]+/).map(x=>x.trim()).filter(Boolean)){
  const split=part.match(/^([^:=\-]{1,80})\s*[:=\-]\s*(.{1,160})$/);
  if(split)out[plain(split[1],80)]=plain(split[2],160);
 }
 return Object.keys(out).length?out:{الخيار:plain(value,200)};
}
function image(value:unknown):string|null{const url=plain(value,2000);return url.startsWith('https://')||url.startsWith('/media/')?url:null;}
function variants(value:unknown,fallbackPrice:number):PublicVariant[]{
 const parsed=json(value);if(!Array.isArray(parsed))return[];
 return parsed.slice(0,100).flatMap(raw=>{
  if(!raw||typeof raw!=='object')return[];const v=raw as Record<string,unknown>,id=plain(v.externalId??v.vid??v.id,191),stock=Number(v.quantity??v.stockQuantity),price=Number(v.publicPriceMinor??fallbackPrice),available=v.available===true&&Number.isSafeInteger(stock)&&stock>0&&Number.isSafeInteger(price)&&price>0;
  if(!id||!available)return[];
  const optionMap={...attributes(v.attributes),...parseOptionMap(v.variantKey??v.optionKey),...parseOptionMap(v.options)},optionValues=Object.values(optionMap);
  const name=plain(v.name,150)||optionValues.join(' / ')||'خيار';
  const original=Number(v.originalPriceMinor??v.listPriceMinor);
  const shipping=Number(v.shippingMinor);
  return[{key:id,vid:plain(v.vid??v.vidId,191)||null,sku:plain(v.sku??v.variantSku,191)||null,name,options:optionValues,attributes:optionMap,image:image(v.image??optionMap.variantImage??optionMap.bigImg),priceMinor:price,stock,originalPriceMinor:Number.isSafeInteger(original)&&original>price?original:null,shippingMinor:Number.isSafeInteger(shipping)&&shipping>=0?shipping:null,deliveryEstimate:deliveryLabel(typeof v.deliveryEstimate==='string'?v.deliveryEstimate:null)}];
 });
}
function importedCjVariants(value:unknown,availability:unknown,fallbackPrice:number,parentStock:number):PublicVariant[]{
 const data=json(value);if(!data||typeof data!=='object')return[];const rows=(data as Record<string,unknown>).variants;if(!Array.isArray(rows))return[];
 const proof=parseCjAvailability({availability_json:typeof availability==='string'?availability:availability?JSON.stringify(availability):null});if(!proof)return[];
 if(!rows.length||proof.variants.length!==rows.length)return[];
 const stockByVid=new Map(proof.variants.filter(v=>v.shippingOptions.length>0).map(v=>[v.vid,v.stockQuantity]));
 if(stockByVid.size!==rows.length)return[];
 const detailVids=rows.flatMap(raw=>raw&&typeof raw==='object'&&typeof(raw as Record<string,unknown>).vid==='string'?[(raw as Record<string,unknown>).vid as string]:[]);
 if(detailVids.length!==rows.length||new Set(detailVids).size!==rows.length)return[];
 const candidates=rows.flatMap(raw=>{if(!raw||typeof raw!=='object')return[];const v=raw as Record<string,unknown>,vid=plain(v.vid,64),quantity=stockByVid.get(vid)||0,sourcePrice=Number(v.priceUsd);if(!/^[A-Za-z0-9_-]{1,64}$/.test(vid)||!Number.isFinite(sourcePrice)||sourcePrice<=0||quantity<1)return[];const attrs={...attributes(v.attributes),...parseOptionMap(v.optionKey)},candidate={externalId:vid,vid,sku:v.sku,name:v.name,quantity:Math.min(quantity,parentStock),available:true,publicPriceMinor:fallbackPrice,options:attrs,image:typeof v.attributes==='object'&&v.attributes?((v.attributes as Record<string,unknown>).variantImage??(v.attributes as Record<string,unknown>).bigImg):null};return[candidate];});
 if(candidates.length!==rows.length)return[];
 return variants(candidates,fallbackPrice);
}
function details(value:unknown):{weightLabel:string|null}{
 const data=json(value);if(!data||typeof data!=='object')return{weightLabel:null};const row=data as Record<string,unknown>,min=Number(row.weightMin),max=Number(row.weightMax);
 if(!Number.isFinite(min)||min<=0)return{weightLabel:null};const minText=Number.isInteger(min)?String(min):min.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
 const maxText=Number.isFinite(max)&&max>min?(Number.isInteger(max)?String(max):max.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')):null;
 return{weightLabel:`${minText}${maxText?`–${maxText}`:''} غ`};
}
function deliveryLabel(value:string|null|undefined):string|null{
 if(!value)return null;const match=value.trim().match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?:\s*(?:days?|يوم|أيام?))?$/i);if(!match)return null;
 const first=Number(match[1]),last=match[2]?Number(match[2]):null;if(first<1||first>120||last!==null&&(last<first||last>180))return null;
 return last===null?`${first} يوم`:`من ${first} إلى ${last} يوم`;
}
function product(row:Row):PublicCommerceProduct|null{
 const parentStock=Math.max(0,row.stock_available-row.stock_reserved),supplierVariants=variants(row.variants,row.price_minor).map(variant=>({...variant,stock:Math.min(variant.stock,parentStock)})).filter(variant=>variant.stock>0),cjVariants=importedCjVariants(row.cj_details_json,row.cj_availability_json,row.price_minor,parentStock),availableVariants=row.cj_source_id!==null?cjVariants:supplierVariants,stock=Math.max(0,Math.min(parentStock,row.available===1?(row.quantity??0):0));
 const optionsParsed=json(row.options),cjDetailParsed=json(row.cj_details_json),cjDetailVariants=cjDetailParsed&&typeof cjDetailParsed==='object'?(cjDetailParsed as Record<string,unknown>).variants:null,requiresVariantSelection=(Array.isArray(json(row.variants))&&(json(row.variants) as unknown[]).length>0)||(Array.isArray(optionsParsed)&&optionsParsed.length>0)||(row.cj_source_id!==null&&Array.isArray(cjDetailVariants)&&cjDetailVariants.length>0);
 if(row.cj_source_id!==null&&availableVariants.length===0)return null;
 if(row.source_id!==null&&availableVariants.length===0&&(requiresVariantSelection||stock===0))return null;
 if(row.source_id===null&&stock===0)return null;
 const shipping=parseCjAvailability({availability_json:row.cj_availability_json});
 if(row.cj_source_id!==null&&(!shipping||row.price_minor<=0||row.stock_available-row.stock_reserved<1))return null;
 if(!Number.isSafeInteger(row.price_minor)||row.price_minor<=0||!plain(row.title,200))return null;
 const optionNames=Array.isArray(optionsParsed)?optionsParsed.flatMap(entry=>entry&&typeof entry==='object'&&typeof(entry as Record<string,unknown>).name==='string'?[plain((entry as Record<string,unknown>).name,100)]:[]):[];
 return{id:row.id.toString(),title:plain(row.title,200),priceMinor:row.price_minor,stock:requiresVariantSelection?availableVariants.reduce((max,v)=>Math.max(max,v.stock),0):stock,images:safeImages(row.images),description:plain(row.description,12000),brand:plain(row.brand,100)||null,options:optionNames,variants:availableVariants,requiresVariantSelection,featured:Number(row.featured)>0,saudiShippingAvailable:row.cj_source_id===null||!!shipping,deliveryEstimate:deliveryLabel(shipping?.shippingOptions.map(item=>item.deliveryDays).find((item):item is string=>!!item)),weightLabel:details(row.cj_details_json).weightLabel};
}
const SELECT=Prisma.sql`SELECT cp.id,cp.title,cp.price_minor,cp.stock_available,cp.stock_reserved,sp.images,sp.description,sp.brand,sp.options,sp.variants,sp.available,sp.quantity,sp.featured,sp.id AS source_id,
 (SELECT cj.id FROM cj_products cj WHERE cj.commerce_product_id=cp.id ORDER BY cj.id LIMIT 1) AS cj_source_id,
 (SELECT cj.availability_json FROM cj_products cj WHERE cj.commerce_product_id=cp.id AND cj.hidden=0 AND cj.status='ready' AND (cj.sale_price_override_minor>0 OR cj.sale_price_minor>0) AND cj.last_sync_at>=UTC_TIMESTAMP(3)-INTERVAL 6 HOUR AND cj.last_sync_at<=UTC_TIMESTAMP(3) AND cj.availability_checked_at>=UTC_TIMESTAMP(3)-INTERVAL 6 HOUR AND cj.availability_checked_at<=UTC_TIMESTAMP(3) AND JSON_VALID(cj.availability_json)=1 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(cj.availability_json,'$.stockQuantity')) AS UNSIGNED)>0 AND JSON_TYPE(JSON_EXTRACT(cj.availability_json,'$.shippingOptions'))='ARRAY' AND JSON_LENGTH(JSON_EXTRACT(cj.availability_json,'$.shippingOptions'))>0 ORDER BY cj.availability_checked_at DESC,cj.id LIMIT 1) AS cj_availability_json,
 (SELECT cj.details_json FROM cj_products cj WHERE cj.commerce_product_id=cp.id AND cj.hidden=0 AND cj.status='ready' ORDER BY cj.id LIMIT 1) AS cj_details_json
 FROM commerce_products cp LEFT JOIN supplier_products sp ON sp.commerce_product_id=cp.id LEFT JOIN commerce_suppliers s ON s.id=sp.supplier_id LEFT JOIN supplier_connections sc ON sc.id=sp.connection_id LEFT JOIN supplier_integration_profiles sip ON sip.supplier_id=sp.supplier_id WHERE cp.approved=1 AND cp.visible=1 AND cp.enabled=1 AND cp.currency='SAR' AND cp.price_minor>0 AND cp.stock_available>cp.stock_reserved AND (sp.id IS NULL OR (sp.active=1 AND sp.visible=1 AND s.active=1 AND sip.maintenance=0 AND sc.status='connected')) AND (NOT EXISTS(SELECT 1 FROM cj_products cj_any WHERE cj_any.commerce_product_id=cp.id) OR EXISTS(SELECT 1 FROM cj_products cj_ready WHERE cj_ready.commerce_product_id=cp.id AND cj_ready.hidden=0 AND cj_ready.status='ready' AND (cj_ready.sale_price_override_minor>0 OR cj_ready.sale_price_minor>0) AND cj_ready.last_sync_at>=UTC_TIMESTAMP(3)-INTERVAL 6 HOUR AND cj_ready.last_sync_at<=UTC_TIMESTAMP(3) AND cj_ready.availability_checked_at>=UTC_TIMESTAMP(3)-INTERVAL 6 HOUR AND cj_ready.availability_checked_at<=UTC_TIMESTAMP(3) AND JSON_VALID(cj_ready.availability_json)=1 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(cj_ready.availability_json,'$.stockQuantity')) AS UNSIGNED)>0 AND JSON_TYPE(JSON_EXTRACT(cj_ready.availability_json,'$.shippingOptions'))='ARRAY' AND JSON_LENGTH(JSON_EXTRACT(cj_ready.availability_json,'$.shippingOptions'))>0))`;
export async function readPublicCommerceProducts(ids:readonly bigint[]):Promise<Map<string,PublicCommerceProduct>>{
 const unique=[...new Set(ids.filter(id=>id>0n))];if(!unique.length)return new Map();if(unique.length>100)throw new Error('commerce_product_limit');await assertCommerceSchemaReady(prisma);
 const rows=await prisma.$queryRaw<Row[]>(Prisma.sql`${SELECT} AND cp.id IN (${Prisma.join(unique)})`);
 return new Map(rows.flatMap(row=>{const value=product(row);return value?[[value.id,value] as const]:[]}));
}
export async function readPublicCommerceProduct(id:bigint):Promise<PublicCommerceProduct|null>{
 return (await readPublicCommerceProducts([id])).get(id.toString())||null;
}
export async function readSimilarPublicCommerceProducts(id:bigint,limit=4):Promise<PublicCommerceProduct[]>{
 const take=Math.min(Math.max(1,limit),8);await assertCommerceSchemaReady(prisma);
 const rows=await prisma.$queryRaw<Row[]>(Prisma.sql`${SELECT} AND cp.id<>${id} ORDER BY cp.id DESC LIMIT ${take}`);
 return rows.flatMap(row=>{const value=product(row);return value?[value]:[];});
}
