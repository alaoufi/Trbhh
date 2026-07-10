'use client';
import { useEffect, useState } from 'react';

/** عدّاد تنازلي حي حتى تاريخ محدد — يختفي عند الانتهاء.
 *  boxes: كل وحدة (يوم/ساعة/دقيقة/ثانية) داخل مربع أنيق باسمها — للبانرات التسويقية. */
export function Countdown({ until, className, boxes = false }: { until: string; className?: string; boxes?: boolean }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!Number.isFinite(left) || left <= 0) return null;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (boxes) {
    const units: [string, string][] = [
      ...(d > 0 ? ([[String(d), 'يوم']] as [string, string][]) : []),
      [pad(h), 'ساعة'],
      [pad(m), 'دقيقة'],
      [pad(sec), 'ثانية'],
    ];
    return (
      <span suppressHydrationWarning className={`flex items-start justify-center gap-1.5 ${className ?? ''}`}>
        {units.map(([val, label], i) => (
          <span key={label} className="flex items-start gap-1.5">
            {i > 0 && <span className="pt-2 text-lg font-black text-amber-300">:</span>}
            <span className="flex flex-col items-center gap-0.5">
              <span className="grid h-11 min-w-11 place-items-center rounded-xl bg-white px-1.5 text-xl font-black tabular-nums text-emerald-900 shadow-md" dir="ltr">{val}</span>
              <span className="text-[10px] font-extrabold text-amber-200">{label}</span>
            </span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span suppressHydrationWarning className={className}>
      {d > 0 && <>{d} يوم </>}
      <span dir="ltr" className="tabular-nums">{pad(h)}:{pad(m)}:{pad(sec)}</span>
    </span>
  );
}
