'use client';
import { useEffect, useState } from 'react';

/** عدّاد تنازلي حي (يوم + ساعات:دقائق:ثوان) حتى تاريخ محدد — يختفي عند الانتهاء. */
export function Countdown({ until, className }: { until: string; className?: string }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!Number.isFinite(left) || left <= 0) return null;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span suppressHydrationWarning className={className}>
      {d > 0 && <>{d} يوم </>}
      <span dir="ltr" className="tabular-nums">{pad(Math.floor((s % 86400) / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</span>
    </span>
  );
}
