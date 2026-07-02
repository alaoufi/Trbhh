'use client';
import { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, ExternalLink, Pause, Play, LogIn } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES, POS_CLASS, SIZE_TITLE, SIZE_BODY, SIZE_TITLE_POSTER, SIZE_BODY_POSTER } from '@/lib/classified-theme';
import { ClassifiedDecor } from '@/components/classified-decor';

const DURATION = 6000; // ms shown before auto-dismiss

export function ClassifiedSplash({ ad }: { ad: Classified | null }) {
  const [show, setShow] = useState(false);
  const [remaining, setRemaining] = useState(DURATION);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!ad) return;
    // shows on every page load/refresh (per the requested behavior)
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
  const dark = theme.text === 'dark' && !ad.image;
  const wa = ad.whatsapp?.replace(/[^\d]/g, '');

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

      <div className="w-full max-w-xs">
        {(() => {
          const poster = !ad.image;
          const titleCls = poster ? SIZE_TITLE_POSTER[ad.size] : SIZE_TITLE[ad.size];
          const bodyCls = poster ? SIZE_BODY_POSTER[ad.size] : SIZE_BODY[ad.size];
          const card = (
            <div
              className={`relative flex aspect-square flex-col overflow-hidden rounded-t-3xl shadow-2xl ring-1 ring-white/20 ${poster ? 'justify-center' : POS_CLASS[ad.pos]} ${dark ? 'text-slate-900' : 'text-white'}`}
              style={ad.image ? undefined : { backgroundImage: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}
            >
              {ad.image && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ad.image} alt={ad.title || ''} className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                </>
              )}
              <ClassifiedDecor pattern={ad.pattern} accent={ad.accent} dark={dark} />
              {ad.link && <span className="absolute right-3 top-3 z-10 rounded-full bg-white/25 p-1.5 backdrop-blur"><ExternalLink className="h-4 w-4" /></span>}
              <div className={`relative z-10 space-y-2 p-6 ${poster ? 'text-center' : ad.align === 'center' ? 'text-center' : 'text-right'}`}>
                {ad.title && <h3 className={`leading-tight drop-shadow ${poster ? 'line-clamp-4' : 'line-clamp-3'} ${titleCls} ${ad.bold ? 'font-extrabold' : 'font-medium'}`}>{ad.title}</h3>}
                {ad.text && <p className={`leading-snug drop-shadow ${poster ? 'line-clamp-3' : 'line-clamp-4'} ${bodyCls} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{ad.text}</p>}
              </div>
            </div>
          );
          return ad.link
            ? <a href={ad.link} target="_blank" rel="noopener noreferrer" onClick={() => setShow(false)} className="block">{card}</a>
            : card;
        })()}

        {/* prominent contact buttons */}
        {(wa || ad.phone) && (
          <div className="flex gap-2 rounded-b-3xl bg-black/30 p-2">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={() => setShow(false)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-3 text-base font-bold text-white"><MessageCircle className="h-5 w-5" /> واتساب</a>}
            {ad.phone && <a href={`tel:${ad.phone}`} onClick={() => setShow(false)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-3 text-base font-bold text-white"><Phone className="h-5 w-5" /> اتصال</a>}
          </div>
        )}
      </div>

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
