'use client';
import { useEffect, useState } from 'react';
import type { FeedBannerItem } from '@/lib/settings';

/** بانر نصي بين إعلانات الرئيسية: نص تسويقي 📢 أو توعوي 💡 يتبدل عشوائياً كل ثوانٍ —
 *  شكل البانر يتبع تصنيف النص المعروض. الضغط عليه يكبّره ويوقف التبديل (للقراءة
 *  براحة)، وضغطة ثانية تعيده لحجمه ويستأنف التبديل. */
export function FeedTextBanner({ items }: { items: FeedBannerItem[] }) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false); // مكبَّر وموقوف بالضغط
  useEffect(() => {
    if (items.length < 2 || paused) return;
    // بداية عشوائية بعد التحميل (وليس أثناء العرض الأولي حتى لا يختلف عن الخادم)
    setI(Math.floor(Math.random() * items.length));
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setI((prev) => {
          let n = Math.floor(Math.random() * items.length);
          if (n === prev) n = (n + 1) % items.length;
          return n;
        });
        setVisible(true);
      }, 250);
    }, 8000);
    return () => clearInterval(t);
  }, [items.length, paused]);
  if (!items.length) return null;
  const cur = items[i] ?? items[0];
  const promo = cur.k === 'promo';
  return (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      aria-pressed={paused}
      title={paused ? 'اضغط للعودة واستئناف التبديل' : 'اضغط للتكبير وإيقاف التبديل'}
      className="card-3d block w-full cursor-pointer overflow-hidden rounded-2xl text-start"
    >
      <div
        className={`flex items-center gap-3 text-white transition-all duration-300 ${paused ? 'px-5 py-6' : 'px-4 py-3'}`}
        style={{ backgroundImage: promo ? 'linear-gradient(135deg, #3287da, #1b4f8a)' : 'linear-gradient(135deg, #059669, #0f766e)' }}
        suppressHydrationWarning
      >
        <span className={`grid shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 transition-all duration-300 ${paused ? 'h-12 w-12 text-2xl' : 'h-9 w-9 text-lg'}`} suppressHydrationWarning>
          {promo ? '📢' : '💡'}
        </span>
        <span className="min-w-0 flex-1">
          <p className={`min-h-[1.5rem] font-bold drop-shadow transition-all duration-300 ${paused ? 'text-lg leading-8' : 'text-sm leading-6'} ${visible ? 'opacity-100' : 'opacity-0'}`} suppressHydrationWarning>
            {cur.t}
          </p>
          {paused && <span className="mt-1 block text-[11px] font-bold text-white/70">⏸ متوقف — اضغط مرة أخرى للعودة</span>}
        </span>
      </div>
    </button>
  );
}
