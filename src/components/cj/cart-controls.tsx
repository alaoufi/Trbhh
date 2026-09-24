'use client';
import Link from 'next/link';
import {useEffect,useId,useState} from 'react';
import {addTrialCartItem,readTrialCart,writeTrialCart,validateTrialCart,MAX_TRIAL_QTY,type TrialCartItem} from '@/lib/cj/trial-cart';

const EVENT='trbhh-cj-trial-cart';
const memory=new Map<number,TrialCartItem[]>();
const EMPTY:TrialCartItem[]=[];
const STORAGE_NOTICE='تعذر الحفظ في المتصفح؛ تبقى السلة في هذه الصفحة مؤقتًا.';

export function useTrialCart(accountId:number){
  const [items,setItems]=useState<TrialCartItem[]>([]),[loadedAccount,setLoadedAccount]=useState<number|null>(null),[notice,setNotice]=useState('');
  useEffect(()=>{
    let next=memory.get(accountId)||[],problem:string|null=null;
    try{const saved=readTrialCart(window.sessionStorage,accountId);problem=saved.problem;if(problem!=='denied')next=saved.items;}catch{problem='denied';}
    memory.set(accountId,next);setItems(next);setLoadedAccount(accountId);
    setNotice(problem==='corrupt'?'حُذفت بيانات سلة غير صالحة. أضف المنتجات من جديد.':problem==='denied'?STORAGE_NOTICE:'');
    const update=(event:Event)=>{const detail=(event as CustomEvent<{accountId:number;notice:string}>).detail;if(detail?.accountId===accountId){setItems(memory.get(accountId)||[]);setNotice(detail.notice);}};
    window.addEventListener(EVENT,update);return()=>window.removeEventListener(EVENT,update);
  },[accountId]);
  function save(next:TrialCartItem[],message=''){
    const clean=validateTrialCart(next);memory.set(accountId,clean);
    let saved=false;try{saved=writeTrialCart(window.sessionStorage,accountId,clean);}catch{/* Denied storage still permits a memory-only trial. */}
    const feedback=[message,saved?'':STORAGE_NOTICE].filter(Boolean).join(' ');
    setItems(clean);setNotice(feedback);window.dispatchEvent(new CustomEvent(EVENT,{detail:{accountId,notice:feedback}}));
  }
  return {items:loadedAccount===accountId?items:EMPTY,ready:loadedAccount===accountId,notice:loadedAccount===accountId?notice:'',save,latest:()=>memory.get(accountId)||[]};
}

export function CartLink({accountId}:{accountId:number}){
  const {items}=useTrialCart(accountId),count=items.reduce((total,item)=>total+item.qty,0);
  return <Link href="/cj/cart" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-primary/25 bg-white px-4 py-2 font-bold text-primary" aria-label={`سلة التجربة، ${count} قطعة`}>سلة التجربة <span className="ms-2" aria-hidden="true">({count})</span></Link>;
}

export function AddToTrialCart({productId,accountId}:{productId:number;accountId:number}){
  const {ready,notice,save,latest}=useTrialCart(accountId),[qty,setQty]=useState('1'),[error,setError]=useState(''),labelId=useId();
  function add(){
    try{if(!/^[1-9]\d?$/.test(qty))throw Error('invalid_quantity');save(addTrialCartItem(latest(),{id:productId,qty:Number(qty)}),'أُضيف المنتج إلى سلة التجربة.');setError('');}
    catch{setError('تعذر الإضافة. الحد ٥٠ منتجًا و٩٩ قطعة لكل منتج؛ اختر كمية صحيحة.');}
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2"><label htmlFor={labelId} className="text-sm font-bold">الكمية<input id={labelId} type="number" min={1} max={MAX_TRIAL_QTY} step={1} value={qty} onChange={event=>setQty(event.target.value)} className="mt-1 block min-h-11 w-24 rounded-lg border border-primary/25 px-3" /></label><button type="button" disabled={!ready} onClick={add} className="min-h-11 rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">أضف لسلة التجربة</button><CartLink accountId={accountId}/></div>
    <p className="text-xs text-muted-foreground">تجربة المنتج الأساسي؛ تُؤكّد الخيارات والتوفر قبل أي شراء مستقبلي. حد الكمية لتنظيم التجربة ولا يمثل المخزون.</p>
    <p role="status" aria-live="polite" className="text-sm text-primary">{error||notice}</p>
  </div>;
}
