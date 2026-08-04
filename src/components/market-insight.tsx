import { estimateValue, areaPriceStats } from '@/lib/assistant';
import { TrendingUp } from 'lucide-react';

// مؤشّر السوق (تقديري) — يعيد استخدام محرّك التقدير المبني على عروض المنصّة:
// تقدير القيمة السوقية للعقار + متوسط سعر المتر للنوع في المدينة، ومقارنة سعر
// الإعلان بهما. فكرة مقتبسة من Zestimate/Redfin — مؤشّر إرشادي لا تقييم رسمي.
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export async function MarketInsight({
  cityId, cityName, reType, area, price, priceType,
}: {
  cityId?: number; cityName?: string | null; reType?: string | null; area?: number | null; price: number; priceType?: string | null;
}) {
  // التقدير يعتمد على عروض البيع فقط — لا يظهر لإعلانات الإيجار
  if (priceType === 'rent') return null;
  const areaN = area && area > 0 ? area : 0;
  const [val, stats] = await Promise.all([
    areaN ? estimateValue(cityId, reType || undefined, areaN).catch(() => null) : Promise.resolve(null),
    areaPriceStats(cityId).catch(() => []),
  ]);
  const stat = (stats || []).find((s) => s.reType === (reType || '')) || null;
  if (!val && !stat) return null;

  const listingPerM2 = price > 0 && areaN ? Math.round(price / areaN) : 0;
  // موضع سعر الإعلان مقارنة بتقدير السوق
  let verdict: { text: string; cls: string } | null = null;
  if (val && price > 0) {
    if (price < val.low) verdict = { text: '✅ أقل من تقدير السوق — فرصة جيدة', cls: 'bg-green-100 text-green-800' };
    else if (price > val.high) verdict = { text: '⬆️ أعلى من تقدير السوق', cls: 'bg-amber-100 text-amber-800' };
    else verdict = { text: '✔ ضمن نطاق سعر السوق', cls: 'bg-sky-100 text-sky-800' };
  }

  return (
    <div className="card-3d space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-primary">
        <TrendingUp className="h-5 w-5" />
        <h3 className="text-sm font-extrabold">مؤشّر السوق <span className="font-normal text-muted-foreground">(تقديري)</span></h3>
      </div>

      {val && (
        <div className="space-y-2">
          <div className="text-[13px] font-bold text-foreground/70">
            القيمة السوقية التقديرية{reType ? ` لـ${reType}` : ''}{areaN ? ` بمساحة ${fmt(areaN)}م²` : ''}
            {cityName ? ` في ${cityName}` : ''}:
          </div>
          {/* شريط المدى: أدنى — تقدير — أعلى */}
          <div className="flex items-stretch gap-1 text-center">
            <div className="flex-1 rounded-lg bg-secondary/50 px-1 py-2">
              <div className="text-[10px] text-muted-foreground">أدنى</div>
              <b className="font-mono text-xs text-foreground/80" dir="ltr">{fmt(val.low)}</b>
            </div>
            <div className="flex-[1.3] rounded-lg bg-primary px-1 py-2 text-white">
              <div className="text-[10px] opacity-90">التقدير</div>
              <b className="font-mono text-sm" dir="ltr">{fmt(val.mid)}</b>
            </div>
            <div className="flex-1 rounded-lg bg-secondary/50 px-1 py-2">
              <div className="text-[10px] text-muted-foreground">أعلى</div>
              <b className="font-mono text-xs text-foreground/80" dir="ltr">{fmt(val.high)}</b>
            </div>
          </div>
          {verdict && <div className={`rounded-lg px-3 py-1.5 text-center text-[13px] font-bold ${verdict.cls}`}>{verdict.text}</div>}
        </div>
      )}

      {stat && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/15 bg-secondary/40 px-3 py-2 text-[13px]">
          <span className="font-bold text-foreground/70">متوسط سعر المتر{reType ? ` لـ${reType}` : ''}{cityName ? ` في ${cityName}` : ''}</span>
          <span className="font-mono font-extrabold text-primary" dir="ltr">{fmt(stat.perM2)} ر.س/م²</span>
          {listingPerM2 > 0 && (
            <span className="w-full text-[11px] text-muted-foreground">
              سعر متر هذا العقار: <b dir="ltr">{fmt(listingPerM2)}</b> ر.س — {listingPerM2 <= stat.perM2 ? 'أقل من المتوسط أو مساوٍ له' : 'أعلى من المتوسط'} (عيّنة {stat.sample} عرض)
            </span>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        📊 مؤشّر إرشادي مبني على عروض البيع في المنصّة — ليس تقييماً رسمياً معتمداً.
      </p>
    </div>
  );
}
