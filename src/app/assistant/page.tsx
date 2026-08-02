import Link from 'next/link';
import { Sparkles, Search, TrendingUp, Home } from 'lucide-react';
import { getCities } from '@/lib/data';
import { RE_TYPES } from '@/lib/realestate-types';
import { estimateValue, areaPriceStats, suggestProperties } from '@/lib/assistant';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المساعد العقاري الذكي' };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ city?: string; type?: string; area?: string; budget?: string }> }) {
  const sp = await searchParams;
  const cityId = Number(sp.city) || undefined;
  const reType = sp.type || undefined;
  const area = Number(sp.area) || 0;
  const budget = Number(sp.budget) || 0;
  const submitted = !!(cityId || reType || area || budget);

  const [cities, valuation, stats, suggestions] = await Promise.all([
    getCities().catch(() => []),
    area > 0 ? estimateValue(cityId, reType, area).catch(() => null) : Promise.resolve(null),
    submitted ? areaPriceStats(cityId).catch(() => []) : Promise.resolve([]),
    submitted ? suggestProperties({ cityId, reType, budget: budget || undefined }).catch(() => []) : Promise.resolve([]),
  ]);
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const cityName = cityId ? cities.find((c) => c.id === cityId)?.name : '';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Sparkles className="h-5 w-5" /> المساعد العقاري الذكي</h1>
        <p className="mt-1 text-xs text-muted-foreground">تقييم مبدئي للعقار، تحليل أسعار المناطق، واقتراح عقارات — مبنيّ على بيانات عروض المنصّة (مؤشّر إرشادي لا تقييم رسمي).</p>
      </div>

      <form method="get" className="card-3d grid grid-cols-2 gap-2 rounded-xl p-3 sm:grid-cols-4">
        <label className="space-y-1"><span className="text-[11px] font-bold text-muted-foreground">المدينة</span>
          <select name="city" defaultValue={sp.city || ''} className={field}><option value="">— اختر —</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-muted-foreground">نوع العقار</span>
          <select name="type" defaultValue={sp.type || ''} className={field}><option value="">— اختر —</option>{RE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-muted-foreground">المساحة (م²) — للتقييم</span>
          <input name="area" type="number" min="0" defaultValue={sp.area || ''} className={field} placeholder="مثال: 300" />
        </label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-muted-foreground">ميزانيتك (ر.س) — للاقتراح</span>
          <input name="budget" type="number" min="0" defaultValue={sp.budget || ''} className={field} placeholder="مثال: 900000" />
        </label>
        <div className="col-span-2 sm:col-span-4">
          <button className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white"><Search className="h-4 w-4" /> حلّل</button>
        </div>
      </form>

      {/* التقييم المبدئي */}
      {area > 0 && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold text-primary"><TrendingUp className="h-4 w-4" /> التقييم المبدئي</h2>
          {valuation ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-secondary/50 p-3"><div className="text-sm font-bold text-muted-foreground">من</div><div className="text-base font-extrabold text-foreground">{fmt(valuation.low)}</div></div>
                <div className="rounded-lg bg-emerald-50 p-3"><div className="text-sm font-bold text-emerald-700">التقدير</div><div className="text-lg font-extrabold text-emerald-800">{fmt(valuation.mid)}</div></div>
                <div className="rounded-lg bg-secondary/50 p-3"><div className="text-sm font-bold text-muted-foreground">إلى</div><div className="text-base font-extrabold text-foreground">{fmt(valuation.high)}</div></div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">بناءً على {valuation.sample} عرضاً مشابهاً — متوسط سعر المتر ≈ <b>{fmt(valuation.perM2)}</b> ر.س{cityName ? ` في ${cityName}` : ''}{reType ? ` لـ${reType}` : ''}. مؤشّر إرشادي.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد عروض مشابهة كافية للتقييم — جرّب مدينة/نوعاً مختلفاً أو أزِل بعض القيود.</p>
          )}
        </div>
      )}

      {/* تحليل أسعار المناطق */}
      {submitted && stats.length > 0 && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-2 text-base font-extrabold text-primary">متوسّط الأسعار{cityName ? ` — ${cityName}` : ''}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-xs text-muted-foreground"><th className="pb-1.5 font-bold">النوع</th><th className="pb-1.5 font-bold">سعر المتر (ر.س)</th><th className="pb-1.5 font-bold">وسيط السعر</th><th className="pb-1.5 font-bold">عروض</th></tr></thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.reType} className="border-t border-primary/10">
                    <td className="py-1.5 font-bold text-primary">{s.reType}</td>
                    <td className="py-1.5">{fmt(s.perM2)}</td>
                    <td className="py-1.5">{fmt(s.avgPrice)}</td>
                    <td className="py-1.5 text-muted-foreground">{s.sample}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* اقتراح عقارات */}
      {submitted && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold text-primary"><Home className="h-4 w-4" /> عقارات مقترحة لك</h2>
          {suggestions.length ? (
            <ul className="divide-y divide-primary/10">
              {suggestions.map((s) => (
                <li key={s.id}><Link href={`/ads/${s.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-primary">
                  <span className="line-clamp-1 text-sm font-bold">{s.title}</span>
                  <span className="shrink-0 text-sm font-extrabold text-emerald-700">{s.price > 0 ? `${fmt(s.price)} ر.س` : 'على السوم'}</span>
                </Link></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد عقارات مطابقة حالياً — وسّع الميزانية أو غيّر المدينة/النوع. <Link href="/map" className="font-bold text-primary underline">تصفّح الخريطة</Link>.</p>
          )}
        </div>
      )}

      {!submitted && (
        <div className="card-3d rounded-2xl p-6 text-center text-sm text-muted-foreground">
          اختر المدينة والنوع (وأدخل المساحة للتقييم أو الميزانية للاقتراح) ثم اضغط «حلّل».
        </div>
      )}
    </div>
  );
}
