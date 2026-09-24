import type {ChosenVariantSnapshot} from './types';

const hidden=/token|secret|password|cost|margin|supplier|api|internal|profit|purchase.?price|external.?id/i;
function text(value:unknown,max=200):string{return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';}
/** Snapshot customer-selectable facts only. Provider identifiers, secrets, and supplier economics are excluded. */
export function chosenVariantSnapshot(key:string,raw:unknown):ChosenVariantSnapshot|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>,attributes:Record<string,string>={};
 for(const source of [v.attributes,v.options])if(source&&typeof source==='object'&&!Array.isArray(source))for(const [rawName,rawValue] of Object.entries(source as Record<string,unknown>)){
  const name=text(rawName,100),value=text(rawValue);
  if(name&&value&&!hidden.test(name))attributes[name]=value;
 }
 // Retain future provider attribute fields without maintaining a fixed option list.
 for(const [rawName,rawValue] of Object.entries(v)){
  const name=text(rawName,100),value=text(rawValue);
  if(!name||!value||hidden.test(name)||/^(externalId|name|variantName|variantKey|variantSku|sku|vid|id|image|variantImage|available|quantity|stock|stockQuantity|publicPriceMinor|price|variantSellPrice|sellPrice|originalPriceMinor|listPriceMinor|shippingMinor|deliveryEstimate|options|attributes)$/i.test(name))continue;
  attributes[name]=value;
 }
 return {key,vid:text(v.vid??v.variantId,191)||null,sku:text(v.sku??v.variantSku,191)||null,attributes};
}
export function parseVariantRecord(value:unknown):Record<string,unknown>|null{
 if(typeof value==='string'){try{const parsed:unknown=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;}catch{return null;}}
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
