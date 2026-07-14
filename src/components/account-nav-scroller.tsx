'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * يلفّ شريط تنقّل حساب أفقياً (على الجوال) ويضيف سهمَي يمين/يسار يظهران فقط عند
 * وجود عناصر مخفية في ذلك الاتجاه — ليوضّح للمستخدم أن القائمة أطول مما يظهر.
 * على الشاشات الكبيرة يتحوّل الشريط لقائمة عمودية والأسهم مخفية.
 */
export function AccountNavScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 2) { setAtStart(true); setAtEnd(true); return; }
    const pos = Math.abs(el.scrollLeft); // RTL: قد يكون scrollLeft سالباً
    setAtStart(pos <= 2);
    setAtEnd(pos >= max - 2);
  }, []);

  useEffect(() => {
    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [update]);

  const nudge = (toEnd: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.7 * (toEnd ? -1 : 1), behavior: 'smooth' });
  };

  return (
    <div className="relative min-w-0">
      {/* سهم يمين: العودة لبداية القائمة — يظهر بعد التمرير */}
      {!atStart && (
        <button type="button" aria-label="عناصر سابقة" onClick={() => nudge(false)}
          className="absolute right-0 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-primary/20 bg-card/95 text-primary shadow-md md:hidden">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {/* سهم يسار: عناصر مخفية للأمام — ينبض للفت الانتباه */}
      {!atEnd && (
        <button type="button" aria-label="عناصر مخفية" onClick={() => nudge(true)}
          className="absolute left-0 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 animate-pulse place-items-center rounded-full border border-primary/20 bg-card/95 text-primary shadow-md md:hidden">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <nav ref={ref} onScroll={update} className="no-scrollbar flex min-w-0 max-w-full gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {children}
      </nav>
    </div>
  );
}
