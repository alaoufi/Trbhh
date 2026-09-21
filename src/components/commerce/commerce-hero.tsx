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
  /** وصف محلي للإعلان أو المنصة؛ النص الفارغ يخفي الشارة. */
  eyebrow?: string;
};

/**
 * Hero بصري متحرّك للكتالوج التجاري (كحلي/ذهبي):
 *   • تشغيل تلقائي كل ٥ث مع إيقاف عند المرور/التركيز/إخفاء التبويب،
 *   • سحب باللمس (swipe) وأزرار ونقاط تنقّل مع تسميات وصولية،
 *   • احترام «تقليل الحركة» (prefers-reduced-motion) فيتوقّف التشغيل التلقائي،
 *   • صور كسولة بأبعاد ثابتة وبديل عند غيابها (لا قفز تخطيط).
 * شريحة واحدة = بلا أزرار/نقاط/تشغيل. صفر شرائح = لا يُصيَّر شيء.
 */
export function CommerceHero({ slides, intervalMs = 5000, label = 'عروض مميّزة', headingLevel = 2 }: {
  slides: HeroSlide[];
  intervalMs?: number;
  label?: string;
  headingLevel?: 1 | 2;
}) {
  const [i, setI] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const n = slides.length;
  const active = n > 0 ? i % n : 0;
  const paused = manualPaused || hovered || focused || hidden || reduced;
  const touchX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    if (n > 0) setI(((next % n) + n) % n);
  }, [n]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(media?.matches === true);
    const onVisibility = () => setHidden(document.hidden);
    onMotion();
    onVisibility();
    media?.addEventListener('change', onMotion);
    // مستقل عن مؤقت الحركة حتى نسمع رجوع التبويب بعد إيقاف المؤقت.
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      media?.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = setInterval(() => setI((c) => (c + 1) % n), Math.max(2000, intervalMs));
    return () => clearInterval(t);
  }, [n, paused, intervalMs]);

  if (n === 0) return null;
  const s = slides[active];
  const eyebrow = s.eyebrow ?? 'متوفّر في جميع مناطق المملكة';
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="relative overflow-hidden rounded-3xl bg-[#16294a] text-white shadow-lg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchCancel={() => { touchX.current = null; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (Math.abs(dx) > 40) go(active + (dx > 0 ? 1 : -1)); // RTL: سحب لليمين = التالي
        touchX.current = null;
      }}
    >
      <Link href={s.href} aria-label={s.title} className="group block">
        <div className="relative flex min-h-[340px] w-full items-center sm:min-h-[360px]">
          {s.image
            ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt={s.title} loading={active === 0 ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            )
            : <div className="absolute inset-0 bg-gradient-to-l from-[#0f1d38] via-[#16294a] to-[#233a63]" />}
          {/* توهّج برتقالي زخرفي */}
          <span aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-[#ff6a1a]/15 blur-3xl" />
          {/* تعتيم كافٍ لإبقاء العنوان مقروءاً فوق أي صورة إعلان مزدحمة:
              طبقة أساس + تدرّج اتجاهي أغمق على يمين النص (RTL) + تدرّج سفلي. */}
          <div className="absolute inset-0 bg-[#0b162e]/45" />
          <div className="absolute inset-0 bg-gradient-to-l from-[#0b162e]/92 via-[#0b162e]/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b162e]/70 via-transparent to-transparent" />
          <div className="relative flex w-full max-w-xl flex-col justify-center p-6 sm:p-10">
            {eyebrow && <span className="mb-3 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-extrabold text-white ring-1 ring-white/25 backdrop-blur">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6a1a]" /> {eyebrow}
            </span>}
            <Heading className="line-clamp-3 break-words text-2xl font-extrabold leading-snug drop-shadow-lg sm:text-4xl">
              {s.title}
            </Heading>
            {s.subtitle && <p className="mt-2 line-clamp-3 max-w-lg break-words text-sm font-semibold leading-6 text-white/85 sm:text-lg">{s.subtitle}</p>}
            <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-[#ff6a1a] px-6 py-3 text-base font-extrabold text-[#16294a] shadow-lg transition group-hover:bg-[#ff8a3d]">
              {s.cta || 'تصفّح الآن'}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
          </div>
        </div>
      </Link>

      {n > 1 && (
        <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => go(active - 1)} aria-label="السابق" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20">‹</button>
            <button type="button" onClick={() => go(active + 1)} aria-label="التالي" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20">›</button>
          </div>
          <div className="flex flex-wrap items-center justify-center" aria-label="اختيار الشريحة">
            {slides.map((sl, k) => (
              <button key={sl.id} type="button" onClick={() => go(k)} aria-label={`الشريحة ${k + 1}`} aria-current={k === active} className="grid h-11 w-6 place-items-center">
                <span className={`h-1.5 rounded-full transition-all ${k === active ? 'w-5 bg-[#ff6a1a]' : 'w-1.5 bg-white/50'}`} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setManualPaused((value) => !value)} disabled={reduced}
            aria-label={reduced ? 'الحركة متوقفة حسب إعدادات جهازك' : manualPaused ? 'تشغيل الحركة' : 'إيقاف الحركة'}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50">
            {manualPaused || reduced
              ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg>
              : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>}
          </button>
        </div>
      )}
    </section>
  );
}
