'use client';
import { useEffect, useState } from 'react';

// en-GB يعطي ترتيباً ثابتاً DD/MM/YYYY بلا علامات اتجاه تبعثر العرض
const fmtDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Riyadh' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' });

/** ساعة حية صغيرة بتوقيت الرياض: التاريخ وفوقه الوقت بالثواني — تظهر تحت الجرس. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="flex flex-col items-center leading-none text-white/80" suppressHydrationWarning dir="ltr">
      <span className="text-[10px] font-extrabold tabular-nums" suppressHydrationWarning>{now ? fmtTime.format(now) : '--:--:--'}</span>
      <span className="mt-0.5 text-[8px] font-bold tabular-nums" suppressHydrationWarning>{now ? fmtDate.format(now) : ''}</span>
    </span>
  );
}
