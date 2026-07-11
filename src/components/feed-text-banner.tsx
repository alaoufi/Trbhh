'use client';
import { useEffect, useState } from 'react';

/** بانر نصي بين إعلانات الرئيسية: يعرض نصاً تسويقياً/توعوياً يتبدل عشوائياً كل ثوانٍ. */
export function FeedTextBanner({ texts }: { texts: string[] }) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (texts.length < 2) return;
    // بداية عشوائية بعد التحميل (وليس أثناء العرض الأولي حتى لا يختلف عن الخادم)
    setI(Math.floor(Math.random() * texts.length));
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setI((prev) => {
          let n = Math.floor(Math.random() * texts.length);
          if (n === prev) n = (n + 1) % texts.length;
          return n;
        });
        setVisible(true);
      }, 250);
    }, 8000);
    return () => clearInterval(t);
  }, [texts.length]);
  if (!texts.length) return null;
  return (
    <div className="card-3d overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundImage: 'linear-gradient(135deg, #3287da, #1b4f8a)' }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-lg ring-1 ring-white/25">📢</span>
        <p className={`min-h-[1.5rem] text-sm font-bold leading-6 drop-shadow transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`} suppressHydrationWarning>
          {texts[i] ?? texts[0]}
        </p>
      </div>
    </div>
  );
}
