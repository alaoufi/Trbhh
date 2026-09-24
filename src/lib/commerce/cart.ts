export type CartLine={productId:string;quantity:number;variantKey?:string};
export const CART_MAX_LINES=100;
export const CART_MAX_QUANTITY=999;
export const COMMERCE_CART_STORAGE_KEY='trbhh-commerce-cart-v2';
export const COMMERCE_CART_EVENT='trbhh-commerce-cart-updated';

export function normalizeCart(input:unknown):CartLine[]{
 if(!Array.isArray(input)||input.length>CART_MAX_LINES)throw new Error('cart_invalid');
 const rows:CartLine[]=[],indices=new Map<string,number>();
 for(const value of input){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('cart_invalid');
  const row=value as Record<string,unknown>,keys=Object.keys(row).sort().join(',');
  if(!['productId,quantity','productId,quantity,variantKey'].includes(keys)||typeof row.productId!=='string'||! /^[1-9]\d{0,14}$/.test(row.productId)||!Number.isSafeInteger(row.quantity)||Number(row.quantity)<1||Number(row.quantity)>CART_MAX_QUANTITY)throw new Error('cart_invalid');
  const variantKey=row.variantKey;
  if(variantKey!==undefined&&(typeof variantKey!=='string'||!variantKey.trim()||variantKey.length>191||/[\u0000-\u001f\u007f]/.test(variantKey)))throw new Error('cart_invalid');
  const line:CartLine={productId:row.productId,quantity:Number(row.quantity),...(variantKey===undefined?{}:{variantKey})},key=`${line.productId}\u0000${line.variantKey||''}`;
  const index=indices.get(key);
  if(index===undefined){indices.set(key,rows.length);rows.push(line);}else{const quantity=rows[index].quantity+line.quantity;if(quantity>CART_MAX_QUANTITY)throw new Error('cart_quantity');rows[index]={...rows[index],quantity};}
 }
 return rows;
}
export function addCartLine(current:readonly CartLine[],next:CartLine):CartLine[]{return normalizeCart([...current,next]);}
/** Merge guest and account baskets by keeping the higher per-line quantity; retries are idempotent. */
export function mergeCartLines(...carts:readonly CartLine[][]):CartLine[]{
 const merged=new Map<string,CartLine>();
 for(const cart of carts)for(const line of normalizeCart(cart)){const key=`${line.productId}\u0000${line.variantKey||''}`,existing=merged.get(key);if(!existing||line.quantity>existing.quantity)merged.set(key,line);}
 return normalizeCart([...merged.values()]);
}
export type CartStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readStoredCart(storage:CartStorage):CartLine[]{const raw=storage.getItem(COMMERCE_CART_STORAGE_KEY);if(raw===null)return[];if(raw.length>16_384)throw new Error('cart_invalid');return normalizeCart(JSON.parse(raw));}
export function writeStoredCart(storage:CartStorage,items:readonly CartLine[]):CartLine[]{const clean=normalizeCart(items);storage.setItem(COMMERCE_CART_STORAGE_KEY,JSON.stringify(clean));return clean;}
export function removeCartLine(current:readonly CartLine[],productId:string,variantKey?:string):CartLine[]{return current.filter(item=>item.productId!==productId||item.variantKey!==variantKey);}
export function setCartQuantity(current:readonly CartLine[],productId:string,quantity:number,variantKey?:string):CartLine[]{
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>CART_MAX_QUANTITY)throw new Error('cart_quantity');
 let found=false;const updated=current.map(item=>{if(item.productId!==productId||item.variantKey!==variantKey)return item;found=true;return{...item,quantity};});
 if(!found)throw new Error('cart_missing_line');return normalizeCart(updated);
}
