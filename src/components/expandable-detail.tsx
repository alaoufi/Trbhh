'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * تفاصيل الإعلان: صندوق ثلاثي الأبعاد عصري يعرض حتى 6 أسطر مع تلاشٍ سفلي —
 * الضغط على «اقرأ المزيد» يمدّد النص كاملاً في مكانه بسلاسة، و«عرض أقل» يعيد
 * انكماشه. لا لوحة منبثقة ولا تأثير على تمرير الصفحة إطلاقاً.
 */
export function ExpandableDetail({ text }: { text: string }) {
  const COLLAPSED_H = 192; // ارتفاع 6 أسطر تقريباً (leading-7) + الحشوة
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [showClamp, setShowClamp] = useState(true); // قصّ الأسطر مطبَّق أثناء الانكماش فقط
  const [fullH, setFullH] = useState(0);
  const pRef = useRef<HTMLParagraphElement>(null);

  // «اقرأ المزيد» يظهر فقط إن كان النص أطول من 6 أسطر فعلاً
  useEffect(() => {
    const el = pRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  const toggle = () => {
    if (!clamped) return;
    if (expanded) {
      setExpanded(false);
      // إعادة قصّ الأسطر بعد انتهاء حركة الانكماش حتى تبقى الحركة سلسة
      setTimeout(() => setShowClamp(true), 320);
    } else {
      setFullH((pRef.current?.scrollHeight ?? 9600) + 24); // + حشوة py-3
      setShowClamp(false);
      setExpanded(true);
    }
  };

  const Box = clamped ? 'button' : 'div';

  return (
    /* 📄 صندوق التفاصيل ثلاثي الأبعاد — الضغط عليه كاملاً يمدّد النص ويكمشه */
    <Box
      {...(clamped ? { type: 'button' as const, onClick: toggle, title: expanded ? 'اضغط لعرض أقل' : 'اضغط لقراءة كامل التفاصيل' } : {})}
      className={`group relative block w-full overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-primary/[0.04] text-start shadow-[0_10px_30px_-8px_rgba(27,79,138,0.35),inset_0_1px_0_rgba(255,255,255,0.6)] transition-transform duration-200 ${clamped ? 'cursor-pointer active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-8px_rgba(27,79,138,0.45),inset_0_1px_0_rgba(255,255,255,0.6)]' : ''}`}
    >
      <span className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-4 py-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-sm shadow-inner">📄</span>
        <span className="text-sm font-extrabold text-primary">التفاصيل</span>
      </span>
      <span
        className="relative block overflow-hidden px-4 py-3 transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: expanded ? fullH : COLLAPSED_H }}
      >
        <p ref={pRef} className={`${showClamp ? 'line-clamp-6' : ''} whitespace-pre-line leading-7 text-foreground/90`}>{text}</p>
        {/* تلاشٍ سفلي يوحي بوجود بقية النص + «اقرأ المزيد» تحت يسار */}
        {clamped && !expanded && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />}
        {clamped && !expanded && (
          <span className="absolute bottom-1.5 left-3 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white shadow-lg group-hover:bg-primary/90">
            اقرأ المزيد ⌄
          </span>
        )}
      </span>
      {clamped && expanded && (
        <span className="block border-t border-primary/10 bg-primary/5 px-4 py-2 text-center text-xs font-bold text-primary">
          عرض أقل ⌃
        </span>
      )}
    </Box>
  );
}
