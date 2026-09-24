import {describe,expect,it} from 'vitest';
import {MAX_MONEY_MINOR} from '@/lib/commerce/money';
import {addTrialCartItem,setTrialCartQuantity,validateTrialCart,trialCartTotal,readTrialCart,writeTrialCart,trialCartStorageKey,type CartStorage} from '@/lib/cj/trial-cart';

describe('CJ parent-product trial cart',()=>{
  it('combines identical row IDs and keeps different parents separate',()=>{
    expect(validateTrialCart([{id:4,qty:2},{id:7,qty:1},{id:4,qty:3}])).toEqual([{id:4,qty:5},{id:7,qty:1}]);
    expect(addTrialCartItem([{id:4,qty:2}],{id:4,qty:3})).toEqual([{id:4,qty:5}]);
    expect(setTrialCartQuantity([{id:4,qty:5}],4,2)).toEqual([{id:4,qty:2}]);
  });
  it.each([null,{},[{id:'4',qty:1}],[{id:4,qty:0}],[{id:4,qty:1.5}],[{id:4,qty:100}],[{id:0,qty:1}],[{id:Number.MAX_SAFE_INTEGER+1,qty:1}],[{id:4,qty:1,price:1}],[{id:4,qty:50},{id:4,qty:50}],Array.from({length:51},(_,id)=>({id:id+1,qty:1}))])('rejects malformed, excessive or caller-priced lines %#',value=>{
    expect(()=>validateTrialCart(value)).toThrow('invalid_cart');
  });
  it('allows adding to an existing line when the fifty-parent limit is full',()=>{
    const items=Array.from({length:50},(_,id)=>({id:id+1,qty:1}));
    expect(addTrialCartItem(items,{id:1,qty:1})[0].qty).toBe(2);
    expect(()=>addTrialCartItem(items,{id:51,qty:1})).toThrow();
  });
  it('preserves exact halalas without extra shipping and rejects zero and overflow',()=>{
    expect(trialCartTotal([{unitMinor:1049,qty:3},{unitMinor:199,qty:2}])).toBe(3545);
    expect(()=>trialCartTotal([{unitMinor:0,qty:1}])).toThrow();
    expect(()=>trialCartTotal([{unitMinor:100,qty:100}])).toThrow();
    expect(()=>trialCartTotal([{unitMinor:MAX_MONEY_MINOR,qty:2}])).toThrow();
    expect(()=>trialCartTotal([{unitMinor:MAX_MONEY_MINOR,qty:1},{unitMinor:1,qty:1}])).toThrow();
  });
  it('stores only validated IDs and quantities under different account namespaces',()=>{
    const values=new Map<string,string>(),storage:CartStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
    expect(writeTrialCart(storage,9,[{id:4,qty:2}])).toBe(true);
    expect(values.get(trialCartStorageKey(9))).toBe('[{"id":4,"qty":2}]');
    expect(readTrialCart(storage,10)).toEqual({items:[],problem:null});
    expect(readTrialCart(storage,9)).toEqual({items:[{id:4,qty:2}],problem:null});
    writeTrialCart(storage,9,[]);expect(readTrialCart(storage,9).items).toEqual([]);
  });
  it('drops corrupt or forged stored prices and reports blocked storage',()=>{
    let value='[{"id":4,"qty":1,"unitMinor":1}]';
    const storage:CartStorage={getItem:()=>value,setItem:(_key,next)=>{value=next;},removeItem:()=>{value='';}};
    expect(readTrialCart(storage,9)).toEqual({items:[],problem:'corrupt'});expect(value).toBe('');
    value='{broken';expect(readTrialCart(storage,9).problem).toBe('corrupt');
    const blocked:CartStorage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}};
    expect(readTrialCart(blocked,9)).toEqual({items:[],problem:'denied'});expect(writeTrialCart(blocked,9,[{id:4,qty:1}])).toBe(false);
  });
});
