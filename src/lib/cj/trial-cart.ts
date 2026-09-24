import {checkedMoney,lineTotal,sumMoney} from '@/lib/commerce/money';

export const MAX_TRIAL_LINES=50;
export const MAX_TRIAL_QTY=99;
export type TrialCartItem={id:number;qty:number};
export type TrialCartLine=TrialCartItem&{title:string;image:string|null;unitMinor:number;currency:'SAR';totalMinor:number};
export type TrialCartQuote={currency:'SAR';lines:TrialCartLine[];totalMinor:number;rejected:{id:number;reason:'unavailable'|'invalid_price'}[]};

export function validateTrialCart(value:unknown):TrialCartItem[]{
  if(!Array.isArray(value)||value.length>MAX_TRIAL_LINES)throw Error('invalid_cart');
  const merged=new Map<number,number>();
  for(const item of value){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='id,qty')throw Error('invalid_cart');
    const {id,qty}=item as TrialCartItem;
    if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(qty)||qty<1||qty>MAX_TRIAL_QTY)throw Error('invalid_cart');
    const total=(merged.get(id)||0)+qty;if(total>MAX_TRIAL_QTY)throw Error('invalid_cart');
    merged.set(id,total);
  }
  return [...merged].map(([id,qty])=>({id,qty}));
}
export function addTrialCartItem(items:TrialCartItem[],item:TrialCartItem):TrialCartItem[]{
  const current=validateTrialCart(items),addition=validateTrialCart([item])[0];
  const found=current.find(row=>row.id===addition.id);
  if(found){found.qty+=addition.qty;return validateTrialCart(current);}
  return validateTrialCart([...current,addition]);
}
export function setTrialCartQuantity(items:TrialCartItem[],id:number,qty:number):TrialCartItem[]{
  validateTrialCart([{id,qty}]);
  return validateTrialCart(validateTrialCart(items).map(item=>item.id===id?{id,qty}:item));
}
export function trialCartTotal(lines:Pick<TrialCartLine,'unitMinor'|'qty'>[]):number{
  if(lines.length>MAX_TRIAL_LINES)throw Error('invalid_cart');
  return sumMoney(lines.map(line=>{if(checkedMoney(line.unitMinor)===0)throw Error('invalid_money');if(!Number.isSafeInteger(line.qty)||line.qty<1||line.qty>MAX_TRIAL_QTY)throw Error('invalid_quantity');return lineTotal(line.unitMinor,line.qty);}));
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
  try{if(raw.length>8192)throw Error('invalid_cart');return {items:validateTrialCart(JSON.parse(raw)),problem:null};}catch{
    try{storage.removeItem(trialCartStorageKey(accountId));}catch{/* The caller stays in memory-only mode. */}
    return {items:[],problem:'corrupt'};
  }
}
export function writeTrialCart(storage:CartStorage,accountId:number,items:TrialCartItem[]):boolean{
  const clean=validateTrialCart(items);
  try{storage.setItem(trialCartStorageKey(accountId),JSON.stringify(clean));return true;}catch{return false;}
}
