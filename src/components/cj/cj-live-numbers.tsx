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
  const boxRef = useRef<HTMLDivElement | null>(null);

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
  const price = available ? (typeof priceMinor === 'number' && priceMinor > 0 ? priceMinor : available.priceMinor) : 0;

  return (
    <div ref={boxRef}>
      {available ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-1.5 text-[11px]">
          <div><span className="text-emerald-800">السعر: </span><b className="text-emerald-900" dir="ltr">{sar(price)}</b></div>
          <div><span className="text-emerald-800">المخزون: </span><b dir="ltr">{available.stock.toLocaleString('en')}</b></div>
          <div><span className="text-emerald-800">الشحن: </span><b dir="ltr">{available.shipMinor === 0 ? 'مجاني' : sar(available.shipMinor)}</b></div>
          <div><span className="text-emerald-800">مدة الشحن: </span><b dir="ltr">{available.deliveryDays ? (/[A-Za-z؀-ۿ]/.test(available.deliveryDays) ? available.deliveryDays : `${available.deliveryDays} يوم`) : '—'}</b></div>
          <div className="col-span-2 border-t border-emerald-200 pt-1"><span className="text-emerald-800">الإجمالي: </span><b className="text-emerald-900" dir="ltr">{sar(price + available.shipMinor)}</b></div>
          <div className="col-span-2 text-[10px] font-normal text-emerald-700">قيم حقيقية حيّة من CJ = سعر الشراء الفعلي للعميل</div>
        </div>
      ) : loading || !data ? (
        <div className="rounded-lg bg-primary/5 p-1.5 text-[11px] text-muted-foreground">جارٍ تحميل البيانات…</div>
      ) : (
        <button type="button" onClick={fetchLive} className="w-full rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-start text-[11px] font-bold text-amber-800">
          تعذّر جلب الأرقام الحيّة الآن{data?.status ? ` (${data.status})` : ''} — اضغط لإعادة المحاولة.
        </button>
      )}
    </div>
  );
}
