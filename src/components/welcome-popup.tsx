'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * بوب أب ترحيبي ثلاثي الأبعاد: يظهر بحركة بارزة فوق المحتوى ويختفي تلقائياً
 * خلال ثوانٍ (أو بالنقر خارجه/على زر الإغلاق) — مرة واحدة فقط لكل جلسة تصفح
 * (مفتاح sessionStorage مختلف لكل استخدام)، فلا يتكرر مزعجاً.
 */
export function WelcomePopup({ storageKey, autoHideMs = 4000, children }: { storageKey: string; autoHideMs?: number; children: React.ReactNode }) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch { /* تعذّر الوصول لتخزين الجلسة — تُعرض مرة بلا تذكّر */ }
    setPhase('in');
    const t = setTimeout(() => setPhase('out'), autoHideMs);
    return () => clearTimeout(t);
  }, [storageKey, autoHideMs]);

  if (phase === 'hidden') return null;
  const close = () => setPhase('out');

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/25 p-4 pt-24 backdrop-blur-[1px]" onClick={close} role="status">
      <div
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={() => { if (phase === 'out') setPhase('hidden'); }}
        className={`card-3d relative w-full max-w-sm rounded-2xl bg-gradient-to-l from-primary/10 to-primary/5 p-4 pt-8 ${phase === 'in' ? 'popup-3d-enter' : 'popup-3d-exit'}`}
      >
        <button type="button" aria-label="إغلاق" onClick={close} className="absolute left-2 top-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-primary/60 hover:bg-primary/10">
          <X className="h-4 w-4" />
        </button>
        <div className="text-center">{children}</div>
      </div>
    </div>
  );
}
