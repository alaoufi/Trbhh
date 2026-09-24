'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useTrialCart} from './cart-controls';
import {CjProductImage} from './product-image';
import {formatSar} from '@/lib/commerce/money';
import {setTrialCartQuantity,MAX_TRIAL_QTY,type TrialCartQuote} from '@/lib/cj/trial-cart';

function CartQuantity({qty,title,onCommit}:{qty:number;title:string;onCommit:(value:string)=>void}){
  const [draft,setDraft]=useState(String(qty));
  useEffect(()=>setDraft(String(qty)),[qty]);
  function commit(){if(!/^[1-9]\d?$/.test(draft))setDraft(String(qty));onCommit(draft);}
  function step(delta:number){const current=/^[1-9]\d?$/.test(draft)?Number(draft):qty,next=Math.min(MAX_TRIAL_QTY,Math.max(1,current+delta));setDraft(String(next));onCommit(String(next));}
  return <div className="space-y-1"><p className="text-sm">الكمية</p><div className="flex flex-wrap items-center gap-1">
    <button type="button" disabled={qty<=1} onClick={()=>step(-1)} aria-label={`إنقاص كمية ${title}`} className="min-h-11 min-w-11 rounded-lg border border-primary/25 text-lg font-bold disabled:opacity-40">−</button>
    <input aria-label={`كمية ${title}`} type="number" min={1} max={MAX_TRIAL_QTY} step={1} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}} className="min-h-11 w-16 rounded-lg border border-primary/25 px-2 text-center"/>
    <button type="button" disabled={qty>=MAX_TRIAL_QTY} onClick={()=>step(1)} aria-label={`زيادة كمية ${title}`} className="min-h-11 min-w-11 rounded-lg border border-primary/25 text-lg font-bold disabled:opacity-40">+</button>
  </div></div>;
}

export function TrialCart({accountId}:{accountId:number}){
  const {items,ready,notice,save}=useTrialCart(accountId);
  const [quote,setQuote]=useState<TrialCartQuote|null>(null),[quoteKey,setQuoteKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[feedback,setFeedback]=useState('');
  const generation=useRef(0);
  useEffect(()=>{
    const current=++generation.current;if(!ready)return;
    const controller=new AbortController();
    if(!items.length){setQuote(null);setBusy(false);setError('');setFeedback('');return()=>controller.abort();}
    setQuote(null);setBusy(true);setError('');
    const timeout=window.setTimeout(()=>{if(generation.current===current){setError('انتهت مهلة تحديث السلة. أعد المحاولة.');setBusy(false);controller.abort();}},15000);
    (async()=>{
      try{
        const response=await fetch('/api/cj/trial-cart',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({items}),signal:controller.signal});
        if(!response.ok)throw Error(response.status===401||response.status===403?'permission':'unavailable');
        const result=await response.json() as TrialCartQuote;
        if(controller.signal.aborted||generation.current!==current)return;
        setQuoteKey(JSON.stringify(items));setQuote(result);
        setFeedback(result.rejected.length?'توجد منتجات غير متاحة للتجربة؛ أزل الأسطر المشار إليها لعرض إجمالي السلة.':'حُدّثت الأسعار التقديرية من المنتجات المحفوظة.');
      }catch(cause){if(!controller.signal.aborted&&generation.current===current)setError(cause instanceof Error&&cause.message==='permission'?'انتهت الجلسة أو لم تعد صلاحية عرض المنتجات متاحة. أعد تسجيل الدخول.':'تعذر تحديث السلة. لا يوجد إجمالي معتمد؛ أعد المحاولة.');}
      finally{window.clearTimeout(timeout);if(!controller.signal.aborted&&generation.current===current)setBusy(false);}
    })();return()=>{window.clearTimeout(timeout);controller.abort();};
  },[accountId,items,ready,refresh]);
  function quantity(id:number,value:string){
    try{if(!/^[1-9]\d?$/.test(value))throw Error('invalid_quantity');save(setTrialCartQuantity(items,id,Number(value)));setFeedback('تُحدّث الكمية والسعر التقديري.');}
    catch{setFeedback('اختر كمية صحيحة بين ١ و٩٩. هذا حد للتجربة وليس إثباتًا للمخزون.');}
  }
  // Never show a previous quantity's amount during the render before the refresh effect.
  const currentQuote=quote&&quoteKey===JSON.stringify(items)?quote:null;
  return <div className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 [overflow-wrap:anywhere]" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold text-primary">سلة التجربة</h1><Link href="/cj" className="min-h-11 rounded-xl border border-primary/25 px-4 py-2 font-bold text-primary">متابعة تصفح منتجات CJ</Link></header>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6">سلة تجريبية لتجميع المنتجات فقط. الشراء والدفع غير مفعّلين.</p>
    <details className="rounded-xl border border-primary/15 px-3 text-sm leading-6"><summary className="min-h-11 cursor-pointer py-2.5 font-bold text-primary">معلومات الأسعار والتوفر</summary><div className="space-y-2 pb-3"><p>معاينة خاصة بالموظفين للمنتج الأساسي. تُؤكّد الخيارات والتوفر قبل الشراء مستقبلًا. الأسعار المحفوظة تقديرية وتشمل تقدير الشحن الموجود في سعر المنتج؛ لا تُضاف رسوم شحن أخرى هنا. الضريبة والشحن النهائي غير مؤكدين.</p><p>حتى ٥٠ منتجًا و٩٩ قطعة لكل منتج لتنظيم التجربة فقط. لا يُحجز مخزون، ولا يُعتمد سعر أو خيار للشراء.</p></div></details>
    <p role="status" aria-live="polite" className="text-sm text-primary">{[notice,feedback].filter(Boolean).join(' ')}</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!ready?<p>جارٍ تحميل السلة المحلية…</p>:!items.length?<p className="rounded-xl border border-dashed border-primary/25 p-8 text-center">السلة فارغة. أضف منتجًا لتجربة الكميات والإجمالي.</p>:<>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setQuote(null);setRefresh(value=>value+1);}} disabled={busy} className="min-h-11 rounded-xl border border-primary/25 px-4 py-2 font-bold disabled:opacity-50">تحديث الأسعار المحفوظة</button><button type="button" onClick={()=>{save([],'أُفرغت سلة التجربة.');setQuote(null);}} className="min-h-11 rounded-xl border border-red-300 px-4 py-2 font-bold text-red-700">إفراغ السلة</button></div>
      <section aria-label="منتجات سلة التجربة" aria-busy={busy} className="space-y-3">
        {items.map((item,index)=>{const line=currentQuote?.lines.find(line=>line.id===item.id),rejected=currentQuote?.rejected.find(line=>line.id===item.id),label=line?.title||`المنتج ${index+1}`;return <article key={item.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-2xl border border-primary/15 bg-white p-4 sm:grid-cols-[96px_minmax(0,1fr)]">
          <CjProductImage src={line?.image} alt={line?.title||'صورة المنتج'} className="h-16 w-16 rounded-xl object-contain sm:row-span-2 sm:h-24 sm:w-24"/>
          <Link href={`/cj/${item.id}`} className="min-w-0 font-bold text-primary [overflow-wrap:anywhere]">{line?.title||(rejected?'منتج غير متاح':'جارٍ تحميل بيانات المنتج')}</Link>
          <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1 sm:col-start-2">
          <CartQuantity qty={item.qty} title={label} onCommit={value=>quantity(item.id,value)}/>
          {line?<p className="text-sm">سعر الوحدة: {formatSar(line.unitMinor)} ر.س · إجمالي السطر: <b>{formatSar(line.totalMinor)} ر.س</b></p>:rejected?<p role="alert" className="text-sm text-red-800">{rejected.reason==='invalid_price'?'سعر المنتج غير صالح للتجربة. أزل هذا السطر.':'المنتج مخفي أو لم يعد متاحًا. أزل هذا السطر.'}</p>:<p className="text-sm text-muted-foreground">{busy?'جارٍ تحديث السعر…':'السعر غير مؤكد الآن.'}</p>}
          <button type="button" onClick={()=>save(items.filter(row=>row.id!==item.id),'أُزيل المنتج من السلة.')} className="min-h-11 text-sm font-bold text-red-700" aria-label={`إزالة ${label}`}>إزالة</button></div>
        </article>;})}
      </section>
      {currentQuote&&!currentQuote.rejected.length&&!busy&&!error&&<p className="rounded-xl bg-primary/5 p-4 text-lg font-extrabold text-primary">الإجمالي التقديري: {formatSar(currentQuote.totalMinor)} ر.س</p>}
    </>}
  </div>;
}
