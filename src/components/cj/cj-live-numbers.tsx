'use client';
import { useEffect, useRef, useState } from 'react';
import {isLiveDisplayPayload,createDisplayReadQueue} from '@/lib/cj/display-freshness';

/**
 * الأرقام الحقيقية الحيّة لبطاقة سلعة (السعر/الشحن/المخزون/الإجمالي) — تُجلب لحظياً عند
 * ظهور البطاقة، مع إعادة استخدام تحقق ناجح لا يتجاوز 30 ثانية على الخادم. طلبات CJ منظَّمة على الخادم (طلب/ثانية) فتُملأ البطاقات
 * تدريجياً. الإجمالي = سعر البيع + أرخص شحن = سعر الشراء الفعلي للعميل. إن تعذّر الجلب
 * تبقى البطاقة قابلة للنقر لإعادة المحاولة.
 */
const pending = new Map<string,Promise<LivePayload>>();
const passiveRead=createDisplayReadQueue(2);

type LivePayload =
  | { status: 'available'; priceMinor: number; shipMinor: number; stock: number; totalMinor: number; deliveryDays: string | null;checkedAt:string;destinationZip:string }
  | { status: string };

const sar = (m: number) => `${(m / 100).toFixed(2)} ر.س`;

export function CjLiveNumbers({ pid,productId }: { pid: string;productId?:number;priceMinor?: number | null }) {
  return <LiveNumbersValue key={`${pid}|${productId??''}`} pid={pid} productId={productId}/>;
}

function LiveNumbersValue({pid,productId}:{pid:string;productId?:number}){
  const [data, setData] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const tried = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  async function fetchLive(refresh=false) {
    if (loading) return;
    setLoading(true);
    try {
      const key=`${pid}|${productId??''}|${refresh}`;
      let request=pending.get(key);
      if(!request){const load=async():Promise<LivePayload>=>{
        if(!mounted.current)return {status:'unavailable'};
        const res=await fetch(`/api/cj/live?pid=${encodeURIComponent(pid)}${productId?`&id=${productId}`:''}${refresh?'&refresh=1':''}`,{credentials:'same-origin',cache:'no-store'});
        if(!res.ok)throw Error('live_read_failed');
        return await res.json() as LivePayload;
      };request=(refresh?load():passiveRead(load)).finally(()=>pending.delete(key));pending.set(key,request);}
      const payload=await request;
      if(payload&&typeof payload.status==='string')setData(payload.status==='available'&&!isLiveDisplayPayload(payload)?{status:'unavailable'}:payload);
    } catch { setData({status:'unavailable'}); }
    finally { setLoading(false); }
  }

  // جلب كسول: لا نطلب أرقام CJ إلا عند ظهور البطاقة في الشاشة (حدّ CJ طلب/ثانية) — فلا
  // تتزاحم طلبات البطاقات المخفية، وتظهر أرقام ما يراه المستخدم أولاً. مرّة واحدة لكل سلعة.
  useEffect(() => {
    if (data || tried.current) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { tried.current = true; void fetchLive(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !tried.current) { tried.current = true; io.disconnect(); void fetchLive(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = data && data.status === 'available' && 'priceMinor' in data ? data : null;
  // سعر البيع المعتمَد للسلعة المستوردة (يدوي/مخزَّن) هو سعر العميل الفعلي؛ وإلا سعر CJ المحسوب.
  const price = available?.priceMinor??0;

  return (
    <div ref={boxRef}>
      {available ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-1.5 text-[11px]">
          <div><span className="text-emerald-800">السعر: </span><b className="text-emerald-900" dir="ltr">{sar(price)}</b></div>
          <div><span className="text-emerald-800">المخزون: </span><b dir="ltr">{available.stock.toLocaleString('en')}</b></div>
          <div><span className="text-emerald-800">الشحن: </span><b dir="ltr">{available.shipMinor === 0 ? 'مجاني' : sar(available.shipMinor)}</b></div>
          <div><span className="text-emerald-800">مدة الشحن: </span><b dir="ltr">{available.deliveryDays ? (/[A-Za-z؀-ۿ]/.test(available.deliveryDays) ? available.deliveryDays : `${available.deliveryDays} يوم`) : '—'}</b></div>
          <div className="col-span-2 border-t border-emerald-200 pt-1"><span className="text-emerald-800">السعر والشحن: </span><b className="text-emerald-900" dir="ltr">{sar(price + available.shipMinor)}</b></div>
          <div className="col-span-2 flex justify-between gap-2 text-[10px]"><span>لكمية 1 · آخر تحقق: {new Date(available.checkedAt).toLocaleTimeString('ar-SA')}</span><button type="button" disabled={loading} onClick={()=>fetchLive(true)}>{loading?'جارٍ التحديث…':'تحديث'}</button></div>
          <div className="col-span-2 text-[10px]">إلى الرمز البريدي {available.destinationZip}</div>
        </div>
      ) : loading || !data ? (
        <div className="rounded-lg bg-primary/5 p-1.5 text-[11px] text-muted-foreground">جارٍ تحميل البيانات…</div>
      ) : (
        <button type="button" onClick={()=>fetchLive(true)} className="w-full rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-start text-[11px] font-bold text-amber-800">
          {data?.status==='destination_required'?'أكمل عنوان الشحن والرمز البريدي في ملفك للتحقق؛ لا توجد أرقام مؤكدة للعرض.':`تعذّر جلب الأرقام الحيّة الآن${data?.status?` (${data.status})`:''} — اضغط لإعادة المحاولة.`}
        </button>
      )}
    </div>
  );
}
