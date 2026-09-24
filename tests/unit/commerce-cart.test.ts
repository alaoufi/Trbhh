import {describe,expect,it} from 'vitest';
import {addCartLine,COMMERCE_CART_STORAGE_KEY,countCartUnits,mergeCartLines,normalizeCart,readStoredCart,removeCartLine,setCartQuantity,writeStoredCart,type CartLine} from '@/lib/commerce/cart';

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
 it('scenario 1: add A then open B and the shared header count remains one',()=>{
  const basket=addCartLine([],base);expect(countCartUnits(basket)).toBe(1);expect(countCartUnits(readStoredCart(memoryStorage(JSON.stringify(basket))))).toBe(1);
 });
 it('scenario 2: add A and B and the shared header count becomes two',()=>{
  const productB:CartLine={productId:'14',quantity:1};
  const basket=addCartLine(addCartLine([],base),productB);expect(basket).toEqual([base,productB]);expect(countCartUnits(basket)).toBe(2);
 });
 it('scenario 3 and 4: refresh and browser back read the same persistent basket',()=>{
  const storage=memoryStorage();writeStoredCart(storage,[base]);expect(readStoredCart(storage)).toEqual([base]);expect(readStoredCart(storage)).toEqual([base]);
  expect(storage.getItem(COMMERCE_CART_STORAGE_KEY)).toBe(JSON.stringify([base]));
 });
 it('migrates the previous session cart instead of discarding it',()=>{
  const old=memoryStorage(JSON.stringify([base]),'trbhh-commerce-cart-v1'),current=memoryStorage();
  expect(readStoredCart(current,old)).toEqual([base]);expect(old.getItem('trbhh-commerce-cart-v1')).toBeNull();expect(current.getItem(COMMERCE_CART_STORAGE_KEY)).toBe(JSON.stringify([base]));
 });
 it('merges guest and account copies idempotently on retry',()=>{
  expect(mergeCartLines([base],[base,{productId:'14',quantity:2}])).toEqual([base,{productId:'14',quantity:2}]);
  expect(mergeCartLines(mergeCartLines([base],[base]),[base])).toEqual([base]);
 });
});
function memoryStorage(initial?:string,key=COMMERCE_CART_STORAGE_KEY){const data=new Map<string,string>();if(initial)data.set(key,initial);return{getItem:(name:string)=>data.get(name)??null,setItem:(name:string,value:string)=>{data.set(name,value);},removeItem:(name:string)=>{data.delete(name);}};}
