'use client';
import { useEffect, useState } from 'react';
import type { FeedBannerItem } from '@/lib/settings';

/** بانر نصي بين إعلانات الرئيسية: نص تسويقي 📢 أو توعوي 💡 يتبدل عشوائياً كل ثوانٍ —
 *  شكل البانر يتبع تصنيف النص المعروض. */
export function FeedTextBanner({ items }: { items: FeedBannerItem[] }) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (items.length < 2) return;
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
  }, [items.length]);
  if (!items.length) return null;
  const cur = items[i] ?? items[0];
  const promo = cur.k === 'promo';
  return (
    <div className="card-3d overflow-hidden rounded-2xl">
      <div
        className="flex items-center gap-3 px-4 py-3 text-white transition-colors duration-500"
        style={{ backgroundImage: promo ? 'linear-gradient(135deg, #3287da, #1b4f8a)' : 'linear-gradient(135deg, #059669, #0f766e)' }}
        suppressHydrationWarning
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-lg ring-1 ring-white/25" suppressHydrationWarning>{promo ? '📢' : '💡'}</span>
        <p className={`min-h-[1.5rem] text-sm font-bold leading-6 drop-shadow transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`} suppressHydrationWarning>
          {cur.t}
        </p>
      </div>
    </div>
  );
}
