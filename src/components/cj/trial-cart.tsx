'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useTrialCart} from './cart-controls';
import {CjProductImage} from './product-image';
import {formatSar} from '@/lib/commerce/money';
import {setTrialCartQuantity,MAX_TRIAL_QTY,type TrialCartItem,type TrialCartQuote} from '@/lib/cj/trial-cart';

function CartQuantity({qty,title,max=MAX_TRIAL_QTY,onCommit}:{qty:number;title:string;max?:number;onCommit:(value:string)=>void}){
  const [draft,setDraft]=useState(String(qty));
  useEffect(()=>setDraft(String(qty)),[qty]);
  function commit(){if(!/^[1-9]\d?$/.test(draft))setDraft(String(qty));onCommit(draft);}
  function step(delta:number){const current=/^[1-9]\d?$/.test(draft)?Number(draft):qty,next=Math.min(max,Math.max(1,current+delta));setDraft(String(next));onCommit(String(next));}
  return <div className="space-y-1"><p className="text-sm">الكمية</p><div className="flex flex-wrap items-center gap-1">
    <button type="button" disabled={qty<=1} onClick={()=>step(-1)} aria-label={`إنقاص كمية ${title}`} className="min-h-11 min-w-11 rounded-lg border border-primary/25 text-lg font-bold disabled:opacity-40">−</button>
    <input aria-label={`كمية ${title}`} type="number" min={1} max={max} step={1} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}} className="min-h-11 w-16 rounded-lg border border-primary/25 px-2 text-center"/>
    <button type="button" disabled={qty>=max} onClick={()=>step(1)} aria-label={`زيادة كمية ${title}`} className="min-h-11 min-w-11 rounded-lg border border-primary/25 text-lg font-bold disabled:opacity-40">+</button>
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
  function quantity(item:TrialCartItem,value:string){
    try{if(!/^[1-9]\d?$/.test(value))throw Error('invalid_quantity');save(setTrialCartQuantity(items,item.id,Number(value),item.variantId));setFeedback('تُحدّث الكمية والسعر التقديري.');}
    catch{setFeedback('اختر كمية صحيحة بين ١ و٩٩. هذا حد للتجربة وليس إثباتًا للمخزون.');}
  }
  // Never show a previous quantity's amount during the render before the refresh effect.
  const currentQuote=quote&&quoteKey===JSON.stringify(items)?quote:null;
  return <div className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 [overflow-wrap:anywhere]" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold text-primary">سلة التجربة</h1><Link href="/cj" className="min-h-11 rounded-xl border border-primary/25 px-4 py-2 font-bold text-primary">متابعة تصفح منتجات CJ</Link></header>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6">سلة تجريبية لتجميع المنتجات فقط. الشراء والدفع غير مفعّلين.</p>
    <details className="rounded-xl border border-primary/15 px-3 text-sm leading-6"><summary className="min-h-11 cursor-pointer py-2.5 font-bold text-primary">معلومات الأسعار والتوفر</summary><div className="space-y-2 pb-3"><p>الأسعار المعروضة تقديرية من بيانات تربح المحفوظة. يتضمن سعر المنتج تقدير الشحن الموجود فيه ولا يُضاف شحن ثانٍ هنا. السعر النهائي والضريبة وموعد الوصول غير مؤكدة.</p><p>حتى ٥٠ خيارًا/منتجًا و٩٩ قطعة لكل سطر للتجربة فقط. لا يُحجز مخزون، ولا يُرسل طلب للمورد.</p></div></details>
    <p role="status" aria-live="polite" className="text-sm text-primary">{[notice,feedback].filter(Boolean).join(' ')}</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!ready?<p>جارٍ تحميل السلة المحلية…</p>:!items.length?<p className="rounded-xl border border-dashed border-primary/25 p-8 text-center">السلة فارغة. أضف منتجًا لتجربة الكميات والإجمالي.</p>:<>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setQuote(null);setRefresh(value=>value+1);}} disabled={busy} className="min-h-11 rounded-xl border border-primary/25 px-4 py-2 font-bold disabled:opacity-50">تحديث الأسعار المحفوظة</button><button type="button" onClick={()=>{save([],'أُفرغت سلة التجربة.');setQuote(null);}} className="min-h-11 rounded-xl border border-red-300 px-4 py-2 font-bold text-red-700">إفراغ السلة</button></div>
      <section aria-label="منتجات سلة التجربة" aria-busy={busy} className="space-y-3">
        {items.map((item,index)=>{const line=currentQuote?.lines.find(line=>line.id===item.id&&line.variantId===item.variantId),rejected=currentQuote?.rejected.find(line=>line.id===item.id&&line.variantId===item.variantId),label=line?.title||`المنتج ${index+1}`;return <article key={`${item.id}:${item.variantId??''}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-2xl border border-primary/15 bg-white p-4 sm:grid-cols-[96px_minmax(0,1fr)]">
          <CjProductImage src={line?.image} alt={line?.title||'صورة المنتج'} className="h-16 w-16 rounded-xl object-contain sm:row-span-2 sm:h-24 sm:w-24"/>
          <Link href={`/cj/${item.id}`} className="min-w-0 font-bold text-primary [overflow-wrap:anywhere]">{line?.title||(rejected?'منتج غير متاح':'جارٍ تحميل بيانات المنتج')}</Link>
          <div className="col-span-2 min-w-0 space-y-3 sm:col-span-1 sm:col-start-2">
          {line?.variantName&&<p className="rounded-lg bg-slate-50 p-2 text-sm leading-6"><span className="text-slate-600">الخيار:</span> <b>{line.variantName}</b>{line.variantSku&&<> · SKU: <b dir="ltr">{line.variantSku}</b></>}{line.variantStock!=null&&<> · المتاح الموثق: <b>{line.variantStock}</b></>}</p>}
          <CartQuantity qty={item.qty} title={label} max={line?.variantStock??MAX_TRIAL_QTY} onCommit={value=>quantity(item,value)}/>
          {line?<div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">سعر الوحدة التقديري</p><p className="mt-1 text-lg font-extrabold text-primary">{formatSar(line.unitMinor)} <span className="text-sm">ر.س</span></p></div><div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">إجمالي هذا السطر · {item.qty} قطعة</p><p className="mt-1 text-xl font-black text-amber-950">{formatSar(line.totalMinor)} <span className="text-sm">ر.س</span></p></div></div>:rejected?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{rejected.reason==='invalid_price'?'سعر المنتج غير صالح للتجربة. أزل هذا السطر.':rejected.reason==='variant_required'?'اختر اللون أو المقاس من صفحة المنتج قبل الإضافة.':rejected.reason==='variant_unavailable'?'الخيار لم يعد متاحًا بالمخزون الموثق؛ حدّث المنتج أو أزل هذا السطر.':'المنتج مخفي أو لم يعد متاحًا. أزل هذا السطر.'}</p>:<p className="text-sm text-muted-foreground">{busy?'جارٍ تحديث السعر…':'السعر غير مؤكد الآن.'}</p>}
          <button type="button" onClick={()=>save(items.filter(row=>row.id!==item.id||row.variantId!==item.variantId),'أُزيل الخيار من السلة.')} className="min-h-11 text-sm font-bold text-red-700" aria-label={`إزالة ${label}${line?.variantName?`، ${line.variantName}`:''}`}>إزالة</button></div>
        </article>;})}
      </section>
      {currentQuote&&!currentQuote.rejected.length&&!busy&&!error&&<section aria-label="إجمالي السلة" className="rounded-2xl border-2 border-primary bg-primary p-5 text-white shadow-sm"><p className="text-sm font-bold text-white/80">الإجمالي التقديري للسلة</p><p className="mt-1 text-3xl font-black tracking-tight">{formatSar(currentQuote.totalMinor)} <span className="text-lg">ر.س</span></p><p className="mt-2 text-xs leading-5 text-white/75">هذا تقدير للتجربة وليس مبلغًا مستحقًا أو سعر شراء نهائيًا.</p></section>}
    </>}
    <section aria-label="الدفع" className="rounded-2xl border border-slate-200 bg-white p-4"><button type="button" disabled aria-disabled="true" title="الدفع غير مفعّل في تجربة CJ" className="flex min-h-14 w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-300 px-4 text-lg font-extrabold text-slate-600">الدفع غير مفعّل</button><p className="mt-2 text-center text-xs text-slate-600">لن يتم تحصيل مبلغ أو إنشاء طلب. يظل الزر معطّلًا حتى اعتماد تفعيل الدفع.</p></section>
  </div>;
}
