'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';

export type HeroSlide = {
  id: string;
  title: string;
  subtitle?: string;
  image: string | null;
  href: string;
  cta?: string;
};

/**
 * Hero بصري متحرّك للكتالوج التجاري (كحلي/ذهبي):
 *   • تشغيل تلقائي كل ٥ث مع إيقاف عند المرور/التركيز/إخفاء التبويب،
 *   • سحب باللمس (swipe) وأزرار ونقاط تنقّل مع تسميات وصولية،
 *   • احترام «تقليل الحركة» (prefers-reduced-motion) فيتوقّف التشغيل التلقائي،
 *   • صور كسولة بأبعاد ثابتة وبديل عند غيابها (لا قفز تخطيط).
 * شريحة واحدة = بلا أزرار/نقاط/تشغيل. صفر شرائح = لا يُصيَّر شيء.
 */
export function CommerceHero({ slides, intervalMs = 5000 }: { slides: HeroSlide[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  const touchX = useRef<number | null>(null);
  const reduced = useRef(false);

  const go = useCallback((next: number) => setI((c) => ((next % n) + n) % n), [n]);

  useEffect(() => {
    reduced.current = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }, []);

  useEffect(() => {
    if (n <= 1 || paused || reduced.current) return;
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => setI((c) => (c + 1) % n), Math.max(2000, intervalMs));
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [n, paused, intervalMs]);

  if (n === 0) return null;
  const s = slides[i];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="عروض مميّزة"
      className="relative overflow-hidden rounded-3xl bg-[#16294a] text-white shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (Math.abs(dx) > 40) go(i + (dx > 0 ? 1 : -1)); // RTL: سحب لليمين = التالي
        touchX.current = null;
      }}
    >
      <Link href={s.href} aria-label={s.title} className="block">
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/8]">
          {s.image
            ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt={s.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            )
            : <div className="absolute inset-0 bg-gradient-to-l from-[#0f1d38] via-[#16294a] to-[#233a63]" />}
          {/* توهّج ذهبي زخرفي */}
          <span aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-[#f0b429]/20 blur-3xl" />
          {/* تعتيم اتجاهي خفيف: أغمق قليلاً على يمين النص (RTL) لإبقاء الصورة ظاهرة وأفتح */}
          <div className="absolute inset-0 bg-gradient-to-l from-[#0b162e]/85 via-[#0b162e]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b162e]/55 via-transparent to-transparent" />
          <div className="absolute inset-y-0 right-0 flex max-w-xl flex-col justify-center p-6 sm:p-10">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#f0b429] px-3 py-1 text-[12px] font-extrabold text-[#16294a] shadow">★ عرض مميّز</span>
            <h2 className="text-2xl font-extrabold leading-tight drop-shadow-lg sm:text-4xl">{s.title}</h2>
            {s.subtitle && <p className="mt-2 max-w-lg text-sm font-semibold text-white/85 sm:text-lg">{s.subtitle}</p>}
            <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-l from-[#ff7418] to-[#f0b429] px-6 py-3 text-base font-extrabold text-[#16294a] shadow-lg transition group-hover:brightness-105">
              {s.cta || 'تسوّق الآن'}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
          </div>
        </div>
      </Link>

      {n > 1 && (
        <>
          <button type="button" onClick={() => go(i - 1)} aria-label="السابق" className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60">‹</button>
          <button type="button" onClick={() => go(i + 1)} aria-label="التالي" className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60">›</button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {slides.map((sl, k) => (
              <button key={sl.id} type="button" onClick={() => go(k)} aria-label={`الشريحة ${k + 1}`} aria-current={k === i}
                className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-[#f0b429]' : 'w-1.5 bg-white/50 hover:bg-white/80'}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
