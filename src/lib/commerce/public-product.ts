import 'server-only';
import {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {assertCommerceSchemaReady} from './schema';

export type PublicVariant={key:string;name:string;options:string[];priceMinor:number;stock:number};
export type PublicCommerceProduct={id:string;title:string;priceMinor:number;stock:number;images:string[];description:string;brand:string|null;options:string[];variants:PublicVariant[];requiresVariantSelection:boolean;featured:boolean};
type Row={id:bigint;title:string;price_minor:number;stock_available:number;stock_reserved:number;images:unknown;description:string;brand:string;options:unknown;variants:unknown;available:number;quantity:number|null;featured:number;source_id:bigint|null};
function json(value:unknown):unknown{if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return null;}}
function safeImages(value:unknown):string[]{
 const parsed=json(value);if(!Array.isArray(parsed))return[];
 const urls=parsed.filter((v):v is string=>typeof v==='string'&&(v.startsWith('https://')||v.startsWith('/media/')));
 return[...new Set(urls)].slice(0,12);
}
function plain(value:unknown,max:number):string{return typeof value==='string'?value.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';}
function variants(value:unknown,fallbackPrice:number):PublicVariant[]{
 const parsed=json(value);if(!Array.isArray(parsed))return[];
 return parsed.slice(0,100).flatMap(raw=>{
  if(!raw||typeof raw!=='object')return[];const v=raw as Record<string,unknown>,id=plain(v.externalId,191),stock=Number(v.quantity),price=Number(v.publicPriceMinor??fallbackPrice),available=v.available===true&&Number.isSafeInteger(stock)&&stock>0&&Number.isSafeInteger(price)&&price>0;
  if(!id||!available)return[];
  const optionValues=v.options&&typeof v.options==='object'?Object.values(v.options as Record<string,unknown>).map(item=>plain(item,100)).filter(Boolean):[];
  const name=plain(v.name,150)||optionValues.join(' / ')||'خيار';
  return[{key:id,name,options:optionValues,priceMinor:price,stock}];
 });
}
function product(row:Row):PublicCommerceProduct|null{
 const parentStock=Math.max(0,row.stock_available-row.stock_reserved),availableVariants=variants(row.variants,row.price_minor).map(variant=>({...variant,stock:Math.min(variant.stock,parentStock)})).filter(variant=>variant.stock>0),stock=Math.max(0,Math.min(parentStock,row.available===1?(row.quantity??0):0));
 const optionsParsed=json(row.options),requiresVariantSelection=(Array.isArray(json(row.variants))&&(json(row.variants) as unknown[]).length>0)||(Array.isArray(optionsParsed)&&optionsParsed.length>0);
 if(row.source_id!==null&&availableVariants.length===0&&(requiresVariantSelection||stock===0))return null;
 if(row.source_id===null&&stock===0)return null;
 const optionNames=Array.isArray(optionsParsed)?optionsParsed.flatMap(entry=>entry&&typeof entry==='object'&&typeof(entry as Record<string,unknown>).name==='string'?[plain((entry as Record<string,unknown>).name,100)]:[]):[];
 return{id:row.id.toString(),title:plain(row.title,200),priceMinor:row.price_minor,stock:requiresVariantSelection?availableVariants.reduce((max,v)=>Math.max(max,v.stock),0):stock,images:safeImages(row.images),description:plain(row.description,12000),brand:plain(row.brand,100)||null,options:optionNames,variants:availableVariants,requiresVariantSelection,featured:Number(row.featured)>0};
}
const SELECT=Prisma.sql`SELECT cp.id,cp.title,cp.price_minor,cp.stock_available,cp.stock_reserved,sp.images,sp.description,sp.brand,sp.options,sp.variants,sp.available,sp.quantity,sp.featured,sp.id AS source_id FROM commerce_products cp LEFT JOIN supplier_products sp ON sp.commerce_product_id=cp.id LEFT JOIN commerce_suppliers s ON s.id=sp.supplier_id LEFT JOIN supplier_connections sc ON sc.id=sp.connection_id LEFT JOIN supplier_integration_profiles sip ON sip.supplier_id=sp.supplier_id WHERE cp.approved=1 AND cp.visible=1 AND cp.enabled=1 AND cp.currency='SAR' AND (sp.id IS NULL OR (sp.active=1 AND sp.visible=1 AND s.active=1 AND sip.maintenance=0 AND sc.status='connected'))`;
export async function readPublicCommerceProducts(ids:readonly bigint[]):Promise<Map<string,PublicCommerceProduct>>{
 const unique=[...new Set(ids.filter(id=>id>0n))];if(!unique.length)return new Map();if(unique.length>100)throw new Error('commerce_product_limit');await assertCommerceSchemaReady(prisma);
 const rows=await prisma.$queryRaw<Row[]>(Prisma.sql`${SELECT} AND cp.id IN (${Prisma.join(unique)})`);
 return new Map(rows.flatMap(row=>{const value=product(row);return value?[[value.id,value] as const]:[]}));
}
export async function readPublicCommerceProduct(id:bigint):Promise<PublicCommerceProduct|null>{
 return (await readPublicCommerceProducts([id])).get(id.toString())||null;
}
