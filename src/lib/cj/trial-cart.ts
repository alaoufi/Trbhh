import {checkedMoney,lineTotal,sumMoney} from '@/lib/commerce/money';

export const MAX_TRIAL_LINES=50;
export const MAX_TRIAL_QTY=99;
export type TrialCartSnapshot={pid:string;vid:string;sku:string;productName:string;rawVariantName:string;optionKey:string;attributes:Record<string,string|number|boolean>;verifiedQuantity:number;unitMinor:number;stockQuantity:number;shippingName:string;shippingMinor:number;shippingAdditionalMinor:number;vatEnabled:boolean;vatMinor:number;totalMinor:number;deliveryDays:string|null;originCountry:string;checkedAt:string};
export type TrialCartItem={id:number;qty:number;variantId?:string;snapshot?:TrialCartSnapshot};
export type TrialCartLine=TrialCartItem&{title:string;variantName:string|null;variantSku:string|null;variantStock:number|null;image:string|null;unitMinor:number;shippingMinor:number;shippingAdditionalMinor:number;vatMinor:number;vatEnabled:boolean;shippingName:string|null;deliveryDays:string|null;currency:'SAR';totalMinor:number};
export type TrialCartQuote={currency:'SAR';lines:TrialCartLine[];totalMinor:number;rejected:{id:number;variantId?:string;reason:'unavailable'|'invalid_price'|'variant_required'|'variant_unavailable'|'verification_required'|'price_changed'|'stock_changed'|'shipping_changed'|'tax_changed'}[]};

export function validateTrialCart(value:unknown):TrialCartItem[]{
  if(!Array.isArray(value)||value.length>MAX_TRIAL_LINES)throw Error('invalid_cart');
  const merged=new Map<string,TrialCartItem>();
  for(const item of value){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('invalid_cart');
    const keys=Object.keys(item).sort().join(','),hasVariant=keys==='id,qty,variantId'||keys==='id,qty,snapshot,variantId',hasSnapshot=keys==='id,qty,snapshot'||keys==='id,qty,snapshot,variantId';
    if(keys!=='id,qty'&&!hasVariant&&keys!=='id,qty,snapshot')throw Error('invalid_cart');
    const {id,qty,variantId,snapshot}=item as TrialCartItem;
    if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(qty)||qty<1||qty>MAX_TRIAL_QTY)throw Error('invalid_cart');
    if(hasVariant&&(typeof variantId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(variantId)))throw Error('invalid_cart');
    if(hasSnapshot&&(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||!validTrialSnapshot(snapshot,variantId)))throw Error('invalid_cart');
    const key=`${id}:${variantId??''}`,previous=merged.get(key),total=(previous?.qty??0)+qty;if(total>MAX_TRIAL_QTY)throw Error('invalid_cart');
    const clean:TrialCartItem={id,qty:total,...(variantId?{variantId}:{}),...(snapshot?{snapshot}:previous?.snapshot?{snapshot:previous.snapshot}:{})};
    merged.set(key,clean);
  }
  return [...merged.values()];
}
export function addTrialCartItem(items:TrialCartItem[],item:TrialCartItem):TrialCartItem[]{
  const current=validateTrialCart(items),addition=validateTrialCart([item])[0];
  const found=current.find(row=>row.id===addition.id&&row.variantId===addition.variantId);
  if(found){found.qty+=addition.qty;if(addition.snapshot)found.snapshot=addition.snapshot;return validateTrialCart(current);}
  return validateTrialCart([...current,addition]);
}
function validTrialSnapshot(value:TrialCartSnapshot,variantId?:string):boolean{
  const fields=['attributes','checkedAt','deliveryDays','originCountry','optionKey','pid','productName','rawVariantName','shippingAdditionalMinor','shippingMinor','shippingName','sku','stockQuantity','totalMinor','unitMinor','vatEnabled','vatMinor','verifiedQuantity','vid'];
  if(Object.keys(value).sort().join(',')!==fields.sort().join(','))return false;
  const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
  const attributes=value.attributes&&typeof value.attributes==='object'&&!Array.isArray(value.attributes)?Object.entries(value.attributes):[];
  return attributes.length<=30&&attributes.every(([key,item])=>key.length<=80&&((typeof item==='string'&&item.length<=160)||typeof item==='number'&&Number.isFinite(item)||typeof item==='boolean'))&&Number.isSafeInteger(value.verifiedQuantity)&&value.verifiedQuantity>0&&text(value.pid,64)&&text(value.vid,64)&&value.vid===variantId&&text(value.sku,100)&&text(value.productName,400)&&text(value.rawVariantName,500)&&text(value.optionKey,500)&&Number.isSafeInteger(value.unitMinor)&&value.unitMinor>0&&Number.isSafeInteger(value.stockQuantity)&&value.stockQuantity>0&&text(value.shippingName,80)&&Number.isSafeInteger(value.shippingMinor)&&value.shippingMinor>=0&&Number.isSafeInteger(value.shippingAdditionalMinor)&&value.shippingAdditionalMinor>=0&&typeof value.vatEnabled==='boolean'&&Number.isSafeInteger(value.vatMinor)&&value.vatMinor>=0&&Number.isSafeInteger(value.totalMinor)&&value.totalMinor>=0&&(value.deliveryDays===null||text(value.deliveryDays,40))&&/^[A-Z]{2}$/.test(value.originCountry)&&Number.isFinite(Date.parse(value.checkedAt));
}
export function setTrialCartQuantity(items:TrialCartItem[],id:number,qty:number,variantId?:string):TrialCartItem[]{
  validateTrialCart(variantId? [{id,qty,variantId}] : [{id,qty}]);
  return validateTrialCart(validateTrialCart(items).map(item=>item.id===id&&item.variantId===variantId?(variantId?{id,qty,variantId}:{id,qty}):item));
}
export function trialCartTotal(lines:(Pick<TrialCartLine,'unitMinor'|'qty'>&{shippingMinor?:number;shippingAdditionalMinor?:number;vatMinor?:number;totalMinor?:number})[]):number{
  if(lines.length>MAX_TRIAL_LINES)throw Error('invalid_cart');
  return sumMoney(lines.map(line=>{if(checkedMoney(line.unitMinor)===0||!Number.isSafeInteger(line.shippingMinor??0)||(line.shippingMinor??0)<0||!Number.isSafeInteger(line.shippingAdditionalMinor??0)||(line.shippingAdditionalMinor??0)<0||!Number.isSafeInteger(line.vatMinor??0)||(line.vatMinor??0)<0)throw Error('invalid_money');if(!Number.isSafeInteger(line.qty)||line.qty<1||line.qty>MAX_TRIAL_QTY)throw Error('invalid_quantity');return line.totalMinor===undefined?lineTotal(line.unitMinor,line.qty)+(line.shippingMinor??0)+(line.shippingAdditionalMinor??0)+(line.vatMinor??0):checkedMoney(line.totalMinor);}));
}
export function trialCartStorageKey(accountId:number):string{
  if(!Number.isSafeInteger(accountId)||accountId<=0)throw Error('invalid_account');
  return `trbhh:cj-trial-cart:v1:${accountId}`;
}
export type CartStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readTrialCart(storage:CartStorage,accountId:number):{items:TrialCartItem[];problem:'corrupt'|'denied'|null}{
  let raw:string|null;
  try{raw=storage.getItem(trialCartStorageKey(accountId));}catch{return {items:[],problem:'denied'};}
  if(raw===null)return {items:[],problem:null};
  try{if(raw.length>80*1024)throw Error('invalid_cart');return {items:validateTrialCart(JSON.parse(raw)),problem:null};}catch{
    try{storage.removeItem(trialCartStorageKey(accountId));}catch{/* The caller stays in memory-only mode. */}
    return {items:[],problem:'corrupt'};
  }
}
export function writeTrialCart(storage:CartStorage,accountId:number,items:TrialCartItem[]):boolean{
  const clean=validateTrialCart(items);
  try{storage.setItem(trialCartStorageKey(accountId),JSON.stringify(clean));return true;}catch{return false;}
}
