import type { AdAddonsInfo } from '@/lib/ad-addons';

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' }).format(d) : '—';
const daysLeft = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));

/** إضافات الإعلان المدفوعة وباقاتها وتواريخ انتهائها — لأدوات الإدارة ولصاحب الإعلان. */
export function AdAddonsBox({ info, title = '⭐ إضافات هذا الإعلان' }: { info: AdAddonsInfo; title?: string }) {
  return (
    <div className="rounded-xl border-2 border-primary/20 bg-white/80 p-3">
      <div className="mb-2 text-sm font-extrabold text-primary">{title}</div>

      {info.current.length === 0 && info.history.length === 0 && (
        <p className="text-xs text-muted-foreground">لا إضافات مدفوعة على هذا الإعلان.</p>
      )}

      {info.current.length > 0 && (
        <ul className="space-y-1.5">
          {info.current.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/5 px-2.5 py-1.5 text-xs">
              <span className="font-bold">{a.icon} {a.label}</span>
              {a.label.includes('تحديث') ? (
                <span className="text-muted-foreground">بتاريخ {fmt(a.until)}</span>
              ) : a.active ? (
                <span className="font-bold text-emerald-700">
                  نشطة — تنتهي {fmt(a.until)}{a.until ? ` (متبقي ${daysLeft(a.until)} يوم)` : ''}
                </span>
              ) : (
                <span className="font-bold text-red-600">منتهية — {fmt(a.until)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {info.history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-primary">🧾 سجل شراء الإضافات ({info.history.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {info.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-2.5 py-1.5 text-[11px]">
                <span className="font-medium">{h.label}</span>
                <span className="shrink-0 text-muted-foreground">{h.amount} ر.س · {fmt(h.date)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
