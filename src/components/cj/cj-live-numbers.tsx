'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * الأرقام الحقيقية الحيّة لبطاقة سلعة (السعر/الشحن/المخزون/الإجمالي) — تُجلب لحظياً عند
 * ظهور البطاقة (بلا تخزين مسبق). طلبات CJ منظَّمة على الخادم (طلب/ثانية) فتُملأ البطاقات
 * تدريجياً. الإجمالي = سعر البيع + أرخص شحن = سعر الشراء الفعلي للعميل. إن تعذّر الجلب
 * تبقى البطاقة قابلة للنقر لإعادة المحاولة.
 */
const cache = new Map<string, LivePayload>(); // ذاكرة جلسة المتصفح تمنع تكرار الطلب لنفس السلعة

type LivePayload =
  | { status: 'available'; priceMinor: number; shipMinor: number; stock: number; totalMinor: number; deliveryDays: string | null }
  | { status: string };

const sar = (m: number) => `${(m / 100).toFixed(2)} ر.س`;

export function CjLiveNumbers({ pid, priceMinor }: { pid: string; priceMinor?: number | null }) {
  const [data, setData] = useState<LivePayload | null>(cache.get(pid) ?? null);
  const [loading, setLoading] = useState(false);
  const tried = useRef(false);

  async function fetchLive() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cj/live?pid=${encodeURIComponent(pid)}`, { credentials: 'same-origin', cache: 'no-store' });
      const payload = await res.json() as LivePayload;
      if (payload && typeof payload.status === 'string') { cache.set(pid, payload); setData(payload); }
    } catch { /* يبقى قابلاً للنقر لإعادة المحاولة */ }
    finally { setLoading(false); }
  }

  useEffect(() => { if (!data && !tried.current) { tried.current = true; void fetchLive(); } }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data && data.status === 'available' && 'priceMinor' in data) {
    const d = data;
    // سعر البيع المعتمَد للسلعة المستوردة (يدوي/مخزَّن) هو سعر العميل الفعلي؛ وإلا سعر CJ المحسوب.
    const price = typeof priceMinor === 'number' && priceMinor > 0 ? priceMinor : d.priceMinor;
    const total = price + d.shipMinor;
    return (
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-1.5 text-[11px]">
        <div><span className="text-emerald-800">السعر: </span><b className="text-emerald-900" dir="ltr">{sar(price)}</b></div>
        <div><span className="text-emerald-800">الإجمالي: </span><b className="text-emerald-900" dir="ltr">{sar(total)}</b></div>
        <div><span className="text-emerald-800">الشحن: </span><b dir="ltr">{d.shipMinor === 0 ? 'مجاني' : sar(d.shipMinor)}</b></div>
        <div><span className="text-emerald-800">المخزون: </span><b dir="ltr">{d.stock.toLocaleString('en')}</b></div>
        <div className="col-span-2 text-[10px] font-normal text-emerald-700">قيم حقيقية حيّة من CJ = سعر الشراء الفعلي للعميل{d.deliveryDays ? ` · التسليم ${d.deliveryDays}` : ''}</div>
      </div>
    );
  }

  if (loading || !data) {
    return <div className="rounded-lg bg-primary/5 p-1.5 text-[11px] text-muted-foreground">{loading ? 'جارٍ جلب الأرقام الحيّة من CJ…' : 'بانتظار الجلب…'}</div>;
  }

  // تعذّر الجلب أو السلعة غير متاحة الآن — قابل للنقر لإعادة المحاولة.
  return (
    <button type="button" onClick={fetchLive} className="w-full rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-start text-[11px] font-bold text-amber-800">
      تعذّر جلب الأرقام الحيّة الآن (قد تكون غير متوفّرة للسعودية) — اضغط لإعادة المحاولة.
    </button>
  );
}
