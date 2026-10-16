'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useTrialCart} from './cart-controls';
import {CjProductImage} from './product-image';
import {SubmitButton} from './submit-button';
import {formatSar} from '@/lib/commerce/money';
import {setTrialCartQuantity,validateTrialCart,MAX_TRIAL_QTY,type TrialCartItem,type TrialCartQuote} from '@/lib/cj/trial-cart';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
import {placeCjTrialOrder} from '@/app/cj/cart/actions';

function CartQuantity({qty,title,max=MAX_TRIAL_QTY,resetSignal,disabled,onCommit,onRemove}:{qty:number;title:string;max?:number;resetSignal:number;disabled:boolean;onCommit:(value:string)=>void;onRemove:()=>void}){
  const [draft,setDraft]=useState(String(qty));
  useEffect(()=>setDraft(String(qty)),[qty,resetSignal]);
  function commit(){if(disabled)return;if(!/^[1-9]\d?$/.test(draft))setDraft(String(qty));onCommit(draft);}
  function step(delta:number){if(disabled)return;const current=/^[1-9]\d?$/.test(draft)?Number(draft):qty;if(delta<0&&current<=1){onRemove();return;}const next=Math.min(max,Math.max(1,current+delta));setDraft(String(next));onCommit(String(next));}
  return <div className="inline-flex items-center rounded-lg border border-primary/25">
    <button type="button" disabled={disabled} onClick={()=>step(-1)} aria-label={qty<=1?`إزالة ${title}`:`إنقاص كمية ${title}`} className="h-11 w-11 text-lg font-black text-primary">−</button>
    <input aria-label={`كمية ${title}`} type="number" disabled={disabled} min={1} max={max} step={1} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}} className="h-11 w-12 border-x border-primary/20 text-center text-[13px]"/>
    <button type="button" disabled={disabled||qty>=max} onClick={()=>step(1)} aria-label={`زيادة كمية ${title}`} className="h-11 w-11 text-lg font-black text-primary disabled:opacity-40">+</button>
  </div>;
}

type ShipDefault={name:string;phone:string;city:string;region:string;address1:string;address2:string};
export function TrialCart({accountId,ship,checkoutMessage,setupHref}:{accountId:number;ship:ShipDefault|null;checkoutMessage?:string|null;setupHref?:string|null}){
  const {items,ready,notice,save,latest}=useTrialCart(accountId);
  const [quote,setQuote]=useState<TrialCartQuote|null>(null),[quoteKey,setQuoteKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[resetSignal,setResetSignal]=useState(0);
  const generation=useRef(0);
  const quantityRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>{quantityRequest.current?.abort();quantityRequest.current=null;},[accountId,items]);
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
        setFeedback(result.rejected.length?'تغيّر السعر أو المخزون أو الشحن، أو تعذر التحقق. راجع الخيار من صفحة المنتج وأعد إضافته بعد التحقق.':'');
      }catch(cause){if(!controller.signal.aborted&&generation.current===current)setError(cause instanceof Error&&cause.message==='permission'?'انتهت الجلسة أو لم تعد صلاحية عرض المنتجات متاحة. أعد تسجيل الدخول.':'تعذر تحديث السلة. لا يوجد إجمالي معتمد؛ أعد المحاولة.');}
      finally{window.clearTimeout(timeout);if(!controller.signal.aborted&&generation.current===current)setBusy(false);}
    })();return()=>{window.clearTimeout(timeout);controller.abort();};
  },[accountId,items,ready]);
  // تغيير الكمية داخل السلة = إعادة تحقّق حيّ من CJ لتلك الكمية. كل القيم المالية
  // (السعر والشحن والرسوم والضريبة والإجمالي) تُؤخذ كما يعيدها CJ لحظياً، لا تُحسب
  // يدوياً ولا تُضرب في الكمية. يبقى مسار الشحن ثابتاً على المسار الذي أُضيف به الخيار:
  // إن لم يَعُد CJ يعرض نفس المسار لهذه الكمية، نُلغي التغيير ونُبقي اللقطة كما هي —
  // ولا نبدّل تلقائياً لمسار آخر (أرخص/أغلى) لأن ذلك يُحدث لخبطة في الإجمالي ولا يُسترجَع
  // الإجمالي الأصلي عند العودة للكمية السابقة.
  async function quantity(item:TrialCartItem,value:string){
    if(quantityRequest.current||busy)return;
    if(!/^[1-9]\d?$/.test(value)){setFeedback('اختر كمية بين ١ و٩٩.');setResetSignal(n=>n+1);return;}
    const newQty=Number(value);
    if(newQty===item.qty)return;
    if(!item.variantId||!item.snapshot){save(setTrialCartQuantity(items,item.id,newQty,item.variantId));return;}
    const controller=new AbortController();quantityRequest.current=controller;
    const originalKey=JSON.stringify(items);
    ++generation.current;setQuote(null);setQuoteKey('');setBusy(true);
    const timeout=window.setTimeout(()=>controller.abort(),15000);
    setFeedback('جارٍ تحديث السعر والشحن من المورد…');
    try{
      const res=await fetch(`/api/cj/products/${item.id}/verify-variant`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({variantId:item.variantId,quantity:newQty})});
      if(!res.ok)throw Error('verify');
      const data=await res.json() as {salePriceMinor?:number;stockQuantity?:number;sku?:string;checkedAt?:string;shippingOptions?:{name:string;priceMinor:number;additionalMinor:number;vatEnabled:boolean;vatMinor:number;totalMinor:number;deliveryDays:string|null;originCountry:string}[]};
      if(controller.signal.aborted||quantityRequest.current!==controller||JSON.stringify(latest())!==originalKey)return;
      if(typeof data.salePriceMinor!=='number'||!data.shippingOptions?.length){setFeedback('تعذّر تحديث الكمية — راجع التوفّر من صفحة المنتج.');setResetSignal(n=>n+1);return;}
      const prev=item.snapshot;
      // نفس مسار الشحن الذي أُضيف به الخيار فقط — بلا أي بديل تلقائي.
      const ship=data.shippingOptions.find(o=>o.name===prev.shippingName&&o.originCountry===prev.originCountry);
      if(!ship){setFeedback('مسار الشحن المعتمد غير متاح لهذه الكمية من المورد. أزل الخيار وأعد إضافته من صفحة المنتج بالكمية المطلوبة.');setResetSignal(n=>n+1);return;}
      const snapshot={...prev,verifiedQuantity:newQty,unitMinor:data.salePriceMinor,stockQuantity:data.stockQuantity??prev.stockQuantity,sku:data.sku||prev.sku,shippingName:ship.name,shippingMinor:ship.priceMinor,shippingAdditionalMinor:ship.additionalMinor,vatEnabled:ship.vatEnabled,vatMinor:ship.vatMinor,totalMinor:ship.totalMinor,deliveryDays:ship.deliveryDays,originCountry:ship.originCountry,checkedAt:data.checkedAt||prev.checkedAt};
      save(validateTrialCart(items.map(row=>row.id===item.id&&row.variantId===item.variantId?{id:item.id,qty:newQty,variantId:item.variantId,snapshot}:row)),'');
    }catch{setFeedback('تعذّر تحديث الكمية الآن — حاول مجدداً.');setResetSignal(n=>n+1);}
    finally{window.clearTimeout(timeout);if(quantityRequest.current===controller){quantityRequest.current=null;setBusy(false);}}
  }
  // Never show a previous quantity's amount during the render before the refresh effect.
  const currentQuote=quote&&quoteKey===JSON.stringify(items)?quote:null;
  return <div className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 [overflow-wrap:anywhere]" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold text-primary">سلة الشراء (إدارة)</h1><Link href="/cj" className="min-h-11 rounded-xl border border-primary/25 px-4 py-2 font-bold text-primary">متابعة تصفح المنتجات</Link></header>
    <p role="status" aria-live="polite" className="text-[13px] font-bold text-primary empty:hidden">{[notice,feedback].filter(Boolean).join(' ')}</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!ready?<p>جارٍ تحميل السلة…</p>:!items.length?<p className="rounded-xl border border-dashed border-primary/25 p-8 text-center">السلة فارغة.</p>:<>
      <section aria-label="منتجات السلة" aria-busy={busy} className="space-y-2">
        {items.map((item,index)=>{const line=currentQuote?.lines.find(line=>line.id===item.id&&line.variantId===item.variantId),rejected=currentQuote?.rejected.find(line=>line.id===item.id&&line.variantId===item.variantId),label=line?.title||`المنتج ${index+1}`;return <article key={`${item.id}:${item.variantId??''}`} className="grid grid-cols-[56px_minmax(0,1fr)] gap-2.5 rounded-2xl border border-primary/15 bg-white p-2.5 sm:grid-cols-[72px_minmax(0,1fr)]">
          <CjProductImage src={line?.image} alt={line?.title||'صورة المنتج'} className="h-14 w-14 rounded-xl object-contain sm:row-span-2 sm:h-[72px] sm:w-[72px]"/>
          <Link href={`/cj/${item.id}`} className="line-clamp-2 min-w-0 text-[13px] font-bold leading-[1.4] text-primary [overflow-wrap:anywhere]">{line?.title||(rejected?'منتج غير متاح':'جارٍ تحميل بيانات المنتج')}</Link>
          <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1 sm:col-start-2">
          {line?.variantSku&&<p className="break-all text-xs text-slate-600">رقم المنتج: {item.id} · رمز الخيار (SKU): <b dir="ltr">{line.variantSku}</b></p>}
          {line?.variantName&&<div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-sm leading-6">{/* الخيار المترجَم مُخزَّن في اللقطة (الإجراء الموحّد)؛ وإلا احتياط القاموس المحلي. */}{item.snapshot?.displayLabel?<p className="col-span-2"><span className="text-slate-600">الخيار:</span> <b dir="auto">{item.snapshot.displayLabel}</b></p>:cjVariantDisplayOptions({variantName:item.snapshot?.rawVariantName||line.variantName,variantKey:item.snapshot?.optionKey||line.variantName,attributes:item.snapshot?.attributes||{}}).map((option,optionIndex)=><p key={`${option.label}-${optionIndex}`}><span className="text-slate-600">{option.label}:</span> <b dir="auto">{option.value}</b></p>)}{line.variantStock!=null&&<p className="col-span-2 text-xs text-slate-600">المخزون وقت التحقق: <b>{line.variantStock}</b></p>}{line.shippingName&&<p className="col-span-2 text-xs text-slate-600">مسار الشحن: <b>{line.shippingName}</b>{line.deliveryDays&&<> · المدة: {line.deliveryDays}</>}</p>}</div>}
          <CartQuantity qty={item.qty} title={label} max={line?.variantStock??MAX_TRIAL_QTY} resetSignal={resetSignal} disabled={busy} onCommit={value=>quantity(item,value)} onRemove={()=>save(items.filter(row=>row.id!==item.id||row.variantId!==item.variantId),'أُزيل الخيار من السلة.')}/>
          {line?<div className="space-y-1 text-[13px]"><div className="flex justify-between gap-2"><span className="text-slate-500">سعر الوحدة</span><b className="text-primary">{formatSar(line.unitMinor)} ر.س</b></div><div className="flex justify-between gap-2"><span className="text-slate-500">الشحن والرسوم</span><b className="text-primary">{formatSar(line.shippingMinor+line.shippingAdditionalMinor)} ر.س</b></div>{line.vatEnabled&&<div className="flex justify-between gap-2"><span className="text-slate-500">الضريبة</span><b>{formatSar(line.vatMinor)} ر.س</b></div>}<div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1 font-extrabold text-amber-900"><span>الإجمالي (×{item.qty})</span><b className="text-base">{formatSar(line.totalMinor)} ر.س</b></div></div>:rejected?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{rejected.reason==='invalid_price'?'السعر غير صالح. أزل هذا السطر.':rejected.reason==='variant_required'?'اختر اللون أو المقاس من صفحة المنتج قبل الإضافة.':rejected.reason==='variant_unavailable'?'تعذر إثبات توفر الخيار؛ أعد التحقق من صفحة المنتج.':rejected.reason==='price_changed'?'تغير السعر منذ إضافته. راجع السعر الجديد قبل الإضافة مجددًا.':rejected.reason==='stock_changed'?'تغير المخزون أو الكمية المتاحة. راجع صفحة المنتج واختر كمية جديدة.':rejected.reason==='shipping_changed'?'تغير مسار الشحن أو تكلفته أو مدته. راجع تفاصيل الشحن قبل الإضافة مجددًا.':rejected.reason==='tax_changed'?'تغيرت سياسة الضريبة أو إجمالي السطر؛ راجع السعر من جديد.':rejected.reason==='verification_required'?'تغيرت الكمية أو انتهى إثبات التحقق. أعد الإضافة من صفحة المنتج.':'المنتج مخفي أو لم يعد متاحًا. أزل هذا السطر.'}</p>:<p className="text-sm text-muted-foreground">{busy?'جارٍ إعادة التحقق من المخزون والشحن…':'السعر غير مؤكد الآن.'}</p>}
          </div>
        </article>;})}
      </section>
    </>}
    {checkoutMessage&&<div role="alert" className="sticky bottom-3 z-10 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">لم يبدأ الدفع: {checkoutMessage}</p>{setupHref&&<Link href={setupHref} className="mt-2 inline-block font-bold underline">إعداد جهة إصدار الفاتورة واعتمادها</Link>}</div>}
    {items.length>0&&currentQuote&&!currentQuote.rejected.length&&!busy&&!error
      ? <form action={placeCjTrialOrder} aria-label="إتمام الطلب" className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3">
          <input type="hidden" name="items" value={JSON.stringify(items)}/>
          {/* عنوان الشحن من ملف العضو — لا إدخال يدوي */}
          <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-extrabold text-primary">عنوان الشحن</span><Link href="/account/addresses" className="text-xs font-bold text-primary underline">تعديل</Link></div>
          {ship
            ? <>
                <p className="text-[13px] font-semibold leading-6 text-slate-700"><b className="text-primary">{ship.name}</b> · {ship.phone}<br/><span className="text-slate-500">{[ship.region,ship.city,ship.address1,ship.address2].filter(Boolean).join('، ')}</span></p>
                <input type="hidden" name="shipName" value={ship.name}/><input type="hidden" name="shipPhone" value={ship.phone}/><input type="hidden" name="shipCity" value={ship.city}/><input type="hidden" name="shipRegion" value={ship.region}/><input type="hidden" name="shipAddress1" value={ship.address1}/><input type="hidden" name="shipAddress2" value={ship.address2}/>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-primary"><input type="checkbox" required className="h-4 w-4 accent-[#16294a]"/>أؤكّد صحة عنوان الشحن</label>
              </>
            : <p className="rounded-lg bg-amber-50 p-2.5 text-[13px] font-bold text-amber-900">لا يوجد عنوان محفوظ — <Link href="/account/addresses" className="underline">أضف عنواناً</Link> أولاً.</p>}
          <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2 text-[15px] font-extrabold text-primary"><span>الإجمالي</span><b className="text-lg text-[#c4510b]">{formatSar(currentQuote.totalMinor)} ر.س</b></div>
          <SubmitButton disabled={!ship} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#c4510b] px-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">ادفع</SubmitButton>
        </form>
      : null}
  </div>;
}
