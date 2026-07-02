'use client';
import { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, ExternalLink, Pause, Play, LogIn } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES } from '@/lib/classified-theme';

const DURATION = 6000; // ms shown before auto-dismiss

export function ClassifiedSplash({ ad }: { ad: Classified | null }) {
  const [show, setShow] = useState(false);
  const [remaining, setRemaining] = useState(DURATION);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!ad) return;
    if (sessionStorage.getItem('trbhh_splash') === '1') return;
    sessionStorage.setItem('trbhh_splash', '1');
    setShow(true);
    let last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (pausedRef.current) return;
      setRemaining((r) => {
        const next = r - dt;
        if (next <= 0) { clearInterval(iv); setShow(false); return 0; }
        return next;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [ad]);

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }

  if (!ad || !show) return null;
  const theme = CLASSIFIED_THEMES[ad.theme % CLASSIFIED_THEMES.length];
  const wa = ad.whatsapp?.replace(/[^\d]/g, '');
  const href = ad.link || (wa ? `https://wa.me/${wa}` : ad.phone ? `tel:${ad.phone}` : null);

  const progress = remaining / DURATION; // 1 → 0
  const R = 20;
  const C = 2 * Math.PI * R;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-black/85 p-6 backdrop-blur-sm">
      {/* elegant circular countdown — above the ad, does not cover it */}
      <div className="relative h-14 w-14">
        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5" />
          <circle
            cx="24" cy="24" r={R} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 60ms linear' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-white">{paused ? '⏸' : seconds}</span>
      </div>

      <a
        href={href || undefined}
        target={ad.link ? '_blank' : undefined}
        rel="noopener noreferrer"
        onClick={() => setShow(false)}
        className="block w-full max-w-xs"
      >
        <div
          className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-3xl text-white shadow-2xl ring-1 ring-white/20"
          style={ad.image ? undefined : { backgroundImage: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}
        >
          {ad.image && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ad.image} alt={ad.title || ''} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            </>
          )}
          {ad.link && <span className="absolute right-3 top-3 z-10 rounded-full bg-white/25 p-1.5 backdrop-blur"><ExternalLink className="h-4 w-4" /></span>}
          <div className="relative z-10 space-y-1 p-5">
            {ad.title && <h3 className="line-clamp-2 text-lg font-extrabold leading-tight drop-shadow">{ad.title}</h3>}
            {ad.text && <p className="line-clamp-4 text-sm leading-snug text-white/90 drop-shadow">{ad.text}</p>}
            <div className="flex items-center gap-2 pt-1">
              {ad.whatsapp && <span className="rounded-full bg-[#25D366] p-1.5"><MessageCircle className="h-4 w-4" /></span>}
              {ad.phone && <span className="rounded-full bg-white/25 p-1.5 backdrop-blur"><Phone className="h-4 w-4" /></span>}
            </div>
          </div>
        </div>
      </a>

      {/* controls: stay (pause) / enter site */}
      <div className="flex items-center gap-3">
        <button onClick={togglePause} className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25">
          {paused ? <><Play className="h-4 w-4" /> متابعة</> : <><Pause className="h-4 w-4" /> البقاء</>}
        </button>
        <button onClick={() => setShow(false)} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-white/90">
          <LogIn className="h-4 w-4" /> الدخول للموقع
        </button>
      </div>
      <p className="text-xs text-white/60">{paused ? 'العرض متوقف — اضغط «الدخول للموقع» متى شئت' : 'ينتقل للموقع تلقائياً'}</p>
    </div>
  );
}
