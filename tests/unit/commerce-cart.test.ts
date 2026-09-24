import {describe,expect,it} from 'vitest';
import {addCartLine,COMMERCE_CART_STORAGE_KEY,mergeCartLines,normalizeCart,readStoredCart,removeCartLine,setCartQuantity,writeStoredCart,type CartLine} from '@/lib/commerce/cart';

const base:CartLine={productId:'12',quantity:1};
describe('commerce cart identity',()=>{
 it('merges only the same product and variant',()=>{
  expect(addCartLine([base],base)).toEqual([{productId:'12',quantity:2}]);
  expect(addCartLine([base],{productId:'12',quantity:1,variantKey:'v2'})).toHaveLength(2);
 });
 it('rejects malformed ids, quantities, and oversized baskets',()=>{
  expect(()=>normalizeCart([{productId:'0',quantity:1}])).toThrow();
  expect(()=>normalizeCart([{productId:'3',quantity:0}])).toThrow();
  expect(()=>normalizeCart(Array.from({length:101},(_,i)=>({productId:String(i+1),quantity:1})))).toThrow();
 });
 it('supports removal and quantity changes without mutating input',()=>{
  const input=[base,{productId:'14',quantity:2}],changed=setCartQuantity(input,'14',1);
  expect(changed).toEqual([base,{productId:'14',quantity:1}]);
  expect(removeCartLine(input,'14')).toEqual([base]);
  expect(input[1].quantity).toBe(2);
 });
 it('keeps the same basket while opening a second product and merging A with B',()=>{
  const productB:CartLine={productId:'14',quantity:1};
  expect(addCartLine(addCartLine([],base),productB)).toEqual([base,productB]);
 });
 it('persists across page refresh and browser back using durable storage',()=>{
  const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
  writeStoredCart(storage,[base]);expect(readStoredCart(storage)).toEqual([base]);
  expect(storage.getItem(COMMERCE_CART_STORAGE_KEY)).toBe(JSON.stringify([base]));
 });
 it('merges guest and account copies idempotently on retry',()=>{
  expect(mergeCartLines([base],[base,{productId:'14',quantity:2}])).toEqual([base,{productId:'14',quantity:2}]);
  expect(mergeCartLines(mergeCartLines([base],[base]),[base])).toEqual([base]);
 });
});
