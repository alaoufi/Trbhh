'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * تفاصيل الإعلان: صندوق ثلاثي الأبعاد عصري يعرض حتى 6 أسطر مع تلاشٍ سفلي —
 * الضغط على الصندوق كاملاً يُبرز النص كاملاً في لوحة منبثقة بارزة تنزلق من
 * الأسفل، تُسحب بالمقبض لأعلى ولأسفل، وتُغلق بالضغط في أي مكان بالصفحة أو بسحبها للأسفل.
 */
export function ExpandableDetail({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [dragY, setDragY] = useState(0);
  const pRef = useRef<HTMLParagraphElement>(null);
  const startY = useRef<number | null>(null);

  // زر/تلميح «العرض الكامل» يظهر فقط إن كان النص أطول من 6 أسطر فعلاً
  useEffect(() => {
    const el = pRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  // قفل تمرير الصفحة أثناء فتح اللوحة (position: fixed يمنع نزول الصفحة الخلفية
  // على الجوال حتى عند لمس أسفل اللوحة) + إغلاق بمفتاح Escape
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow };
    b.position = 'fixed';
    b.top = `-${y}px`;
    b.left = '0';
    b.right = '0';
    b.width = '100%';
    b.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      b.position = prev.position; b.top = prev.top; b.left = prev.left; b.right = prev.right; b.width = prev.width; b.overflow = prev.overflow;
      window.scrollTo(0, y);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onDragStart = (y: number) => { startY.current = y; };
  const onDragMove = (y: number) => {
    if (startY.current === null) return;
    setDragY(Math.max(0, y - startY.current)); // السحب للأسفل فقط (للإغلاق)
  };
  const onDragEnd = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (dragY > 120) setOpen(false); // سحب كافٍ للأسفل = إغلاق
    setDragY(0);
  };

  const Box = clamped ? 'button' : 'div';

  return (
    <>
      {/* 📄 صندوق التفاصيل ثلاثي الأبعاد — الضغط عليه كاملاً يُبرز النص كاملاً */}
      <Box
        {...(clamped ? { type: 'button' as const, onClick: () => setOpen(true), title: 'اضغط لعرض كامل التفاصيل' } : {})}
        className={`group relative block w-full overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-primary/[0.04] text-start shadow-[0_10px_30px_-8px_rgba(27,79,138,0.35),inset_0_1px_0_rgba(255,255,255,0.6)] transition-transform duration-200 ${clamped ? 'cursor-pointer active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-8px_rgba(27,79,138,0.45),inset_0_1px_0_rgba(255,255,255,0.6)]' : ''}`}
      >
        <span className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-4 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-sm shadow-inner">📄</span>
          <span className="text-sm font-extrabold text-primary">التفاصيل</span>
        </span>
        <span className="relative block max-h-48 overflow-hidden px-4 py-3">
          <p ref={pRef} className="line-clamp-6 whitespace-pre-line leading-7 text-foreground/90">{text}</p>
          {/* تلاشٍ سفلي يوحي بوجود بقية النص + «اضغط للمزيد» تحت يسار */}
          {clamped && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />}
          {clamped && (
            <span className="absolute bottom-1.5 left-3 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white shadow-lg group-hover:bg-primary/90">
              اضغط للمزيد ⌄
            </span>
          )}
        </span>
      </Box>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div
            className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border-2 border-primary/20 bg-card shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
            style={{ transform: `translateY(${dragY}px)`, transition: startY.current === null ? 'transform 200ms ease' : 'none' }}
          >
            {/* مقبض السحب: اسحبه للأسفل لإغلاق اللوحة */}
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 border-b border-primary/10 bg-gradient-to-l from-primary/10 to-primary/5 px-4 pb-2 pt-3 active:cursor-grabbing"
              onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
              onTouchMove={(e) => onDragMove(e.touches[0].clientY)}
              onTouchEnd={onDragEnd}
              onMouseDown={(e) => onDragStart(e.clientY)}
              onMouseMove={(e) => { if (startY.current !== null) onDragMove(e.clientY); }}
              onMouseUp={onDragEnd}
              onMouseLeave={onDragEnd}
            >
              <span className="h-1.5 w-12 rounded-full bg-primary/30" />
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-extrabold text-primary">📄 كامل التفاصيل</span>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary/70">✕ إغلاق</button>
              </div>
            </div>
            {/* النص كاملاً — تمرير حر بالسحب لأعلى ولأسفل */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <p className="whitespace-pre-line text-base leading-8 text-foreground/90">{text}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
