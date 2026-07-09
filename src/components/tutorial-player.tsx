'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronLeft, Play, Pause, RotateCcw, Share2, Check } from 'lucide-react';

const SLIDE_MS = 9000; // إيقاع هادئ يتيح قراءة الشرح ومتابعة الحركة

export type TutorialSlide = { caption: string; body: (active: boolean) => React.ReactNode };

/** إطار جوال محاكٍ يعرض داخله «لقطة» متحركة لكل خطوة. */
export function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[6px] border-slate-800 bg-white shadow-2xl">
      <div className="mx-auto mt-1.5 h-1.5 w-16 rounded-full bg-slate-300" />
      <div className="h-[380px] overflow-hidden rounded-b-[1.6rem] rounded-t-lg bg-slate-50 p-3" dir="rtl">{children}</div>
    </div>
  );
}

/** إصبع متحرك يوضّح مكان الضغط. */
export function Tap({ className = '' }: { className?: string }) {
  return <span className={`tut-tap pointer-events-none absolute z-10 grid h-9 w-9 place-items-center rounded-full ${className}`}>👆</span>;
}

/** عدّاد يصعد من 0 إلى الهدف عند ظهور الشريحة. */
export function CountUp({ active, to = 100, step = 5 }: { active: boolean; to?: number; step?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    let v = 0;
    const t = setInterval(() => { v += step; setN(Math.min(v, to)); if (v >= to) clearInterval(t); }, 60);
    return () => clearInterval(t);
  }, [active, to, step]);
  return <span>{n}</span>;
}

/** مشغّل الشروحات المتحركة الموحّد: شرائح تلقائية + تحكّم + مشاركة + زر بدء. */
export function TutorialPlayer({ slides, shareTitle, ctaHref, ctaLabel }: {
  slides: TutorialSlide[]; shareTitle: string; ctaHref: string; ctaLabel: string;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [shared, setShared] = useState(false);
  const n = slides.length;

  const go = (k: number) => setI(((k % n) + n) % n);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (playing) timer.current = setInterval(() => setI((v) => (v + 1) % n), SLIDE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, n]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: shareTitle, url }); } catch { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes tutTap { 0%,100% { transform: scale(1); opacity: .95; } 50% { transform: scale(1.35); opacity: .6; } }
        .tut-tap { animation: tutTap 1.1s ease-in-out infinite; font-size: 22px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
        @keyframes tutPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        .tut-pulse { animation: tutPulse 1.3s ease-in-out infinite; }
        @keyframes tutRise { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .tut-rise { animation: tutRise .8s ease-out both; }
        @keyframes tutType { from { max-width: 0; } to { max-width: 100%; } }
        .tut-type { animation: tutType 1.4s steps(12) .3s both; }
        @keyframes tutCopy { 0%,45% { background: #fff; color: #0369a1; border-color: #7dd3fc; } 55%,100% { background: #dcfce7; color: #15803d; border-color: #86efac; } }
        .tut-copyflash { animation: tutCopy 2.4s ease-in-out infinite; }
        @keyframes tutSpin { to { transform: rotate(8deg); } from { transform: rotate(-8deg); } }
        .tut-spin-slow { animation: tutSpin 1s ease-in-out infinite alternate; }
        @keyframes tutBar { from { width: 0; } to { width: 100%; } }
        .tut-bar { animation: tutBar ${SLIDE_MS}ms linear both; }
        @keyframes tutSlide { from { transform: translateX(-24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .tut-slide { animation: tutSlide .45s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .tut-tap,.tut-pulse,.tut-rise,.tut-type,.tut-copyflash,.tut-spin-slow,.tut-slide { animation-duration: .01s; animation-iteration-count: 1; } }
      `}</style>

      {/* شريط التقدّم */}
      <div className="flex gap-1">
        {slides.map((_, k) => (
          <div key={k} className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
            {k < i && <div className="h-full w-full bg-primary" />}
            {k === i && playing && <div key={`${i}-bar`} className="tut-bar h-full bg-primary" />}
            {k === i && !playing && <div className="h-full w-1/2 bg-primary" />}
          </div>
        ))}
      </div>

      {/* الشريحة */}
      <div key={i} className="tut-slide">
        <Phone>{slides[i].body(true)}</Phone>
      </div>

      {/* الشرح */}
      <div className="mx-auto max-w-md rounded-2xl border-2 border-primary/25 bg-card p-3 text-center">
        <div className="text-xs font-extrabold text-primary">الخطوة {i + 1} من {n}</div>
        <p className="mt-1 text-sm font-extrabold leading-relaxed text-foreground">{slides[i].caption}</p>
      </div>

      {/* التحكم */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => go(i + 1)} aria-label="التالي" className="btn-3d grid h-11 w-11 place-items-center rounded-full bg-primary text-white"><ChevronLeft className="h-5 w-5" /></button>
        <button onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'إيقاف' : 'تشغيل'} className="btn-3d grid h-12 w-12 place-items-center rounded-full bg-primary text-white">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button onClick={() => go(i - 1)} aria-label="السابق" className="btn-3d grid h-11 w-11 place-items-center rounded-full bg-primary text-white"><ChevronRight className="h-5 w-5" /></button>
        <button onClick={() => { go(0); setPlaying(true); }} aria-label="إعادة" className="grid h-11 w-11 place-items-center rounded-full border-2 border-primary/30 text-primary"><RotateCcw className="h-5 w-5" /></button>
      </div>

      {/* مشاركة + ابدأ */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button onClick={share} className="btn-3d inline-flex items-center gap-1.5 rounded-full border-2 border-primary/30 bg-white px-4 py-2 text-sm font-bold text-primary">
          {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {shared ? 'تم نسخ الرابط' : 'مشاركة الشرح'}
        </button>
        <Link href={ctaHref} className="btn-3d inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">{ctaLabel}</Link>
      </div>
    </div>
  );
}
