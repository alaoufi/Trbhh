import type { DailyPoint } from '@/lib/analytics';

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function label(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${AR_MONTHS[(m || 1) - 1]}`;
}

/**
 * Simple, dependency-free daily-views bar chart (last 30 days).
 * Single series in the brand color; native <title> gives a per-bar tooltip.
 * Chronological left→right (oldest→newest); the axis labels the endpoints.
 */
export function ViewsChart({ daily }: { daily: DailyPoint[] }) {
  const max = Math.max(1, ...daily.map((p) => p.views));
  const W = 100; // viewBox width in %
  const gap = 0.6;
  const bw = (W - gap * (daily.length - 1)) / daily.length;
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="مشاهدات آخر 30 يوماً">
        {daily.map((p, i) => {
          const h = (p.views / max) * 38;
          const x = i * (bw + gap);
          return (
            <g key={p.date}>
              <rect x={x} y={40 - h} width={bw} height={Math.max(h, p.views > 0 ? 0.6 : 0.2)} rx={0.4}
                className={p.views > 0 ? 'fill-primary' : 'fill-muted-foreground/20'}>
                <title>{`${label(p.date)}: ${p.views} مشاهدة`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label(daily[0].date)}</span>
        <span>الأكثر في يوم: {max}</span>
        <span>{label(daily[daily.length - 1].date)}</span>
      </div>
    </div>
  );
}
