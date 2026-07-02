'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, MessageCircle, ExternalLink, Pause, Play, LogIn, Sparkles } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES, POS_CLASS, SIZE_TITLE, SIZE_BODY, SIZE_TITLE_POSTER, SIZE_BODY_POSTER } from '@/lib/classified-theme';
import { ClassifiedDecor } from '@/components/classified-decor';

const DURATION = 9000; // ms the entry splash stays before auto-entering the site

function Tile({ ad, delay, onNavigate }: { ad: Classified; delay: number; onNavigate: () => void }) {
  const theme = CLASSIFIED_THEMES[ad.theme % CLASSIFIED_THEMES.length];
  const poster = !ad.image;
  const dark = theme.text === 'dark' && poster;
  const wa = ad.whatsapp?.replace(/[^\d]/g, '');
  const titleCls = poster ? SIZE_TITLE_POSTER[ad.size] : SIZE_TITLE[ad.size];
  const bodyCls = poster ? SIZE_BODY_POSTER[ad.size] : SIZE_BODY[ad.size];

  const card = (
    <div
      className={`relative flex aspect-square flex-col overflow-hidden rounded-t-2xl shadow-2xl ring-1 ring-white/20 ${poster ? 'justify-center' : POS_CLASS[ad.pos]} ${dark ? 'text-slate-900' : 'text-white'}`}
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
      {ad.link && <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>}
      <div className={`relative z-10 space-y-1 p-3 ${poster ? 'text-center' : ad.align === 'center' ? 'text-center' : 'text-right'}`}>
        {ad.title && <h3 className={`leading-tight drop-shadow ${poster ? 'line-clamp-4' : 'line-clamp-2'} ${titleCls} ${ad.bold ? 'font-extrabold' : 'font-medium'}`}>{ad.title}</h3>}
        {ad.text && <p className={`leading-snug drop-shadow ${poster ? 'line-clamp-3' : 'line-clamp-2'} ${bodyCls} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{ad.text}</p>}
      </div>
    </div>
  );

  return (
    <div className="float-3d" style={{ animationDelay: `${delay}ms` }}>
      {ad.link ? (
        <a href={ad.link} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className="block">{card}</a>
      ) : (
        card
      )}
      {(wa || ad.phone) && (
        <div className="flex gap-1 rounded-b-2xl bg-black/30 p-1.5">
          {ad.phone && <a href={`tel:${ad.phone}`} onClick={onNavigate} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white"><Phone className="h-3.5 w-3.5" /> اتصال</a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#25D366] py-2 text-xs font-bold text-white"><MessageCircle className="h-3.5 w-3.5" /> واتساب</a>}
        </div>
      )}
    </div>
  );
}

export function ClassifiedSplash({ ads }: { ads: Classified[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [remaining, setRemaining] = useState(DURATION);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const total = ads.length;

  useEffect(() => {
    if (!total) return;
    setShow(true);
    let last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (pausedRef.current) return;
      setRemaining((r) => {
        const next = r - dt;
        if (next <= 0) {
          clearInterval(iv);
          setShow(false);
          return 0;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [total]);

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }
  function enterSite() {
    setShow(false);
    router.push('/'); // go to the regular ads home page
  }

  if (!total || !show) return null;

  const progress = remaining / DURATION;
  const R = 18;
  const C = 2 * Math.PI * R;
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/85 backdrop-blur-sm">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-5 w-5 text-amber-300" />
          <span className="text-sm font-bold">الإعلانات المبوّبة</span>
        </div>
        <div className="relative h-11 w-11">
          <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
            <circle cx="22" cy="22" r={R} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset 60ms linear' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{paused ? '⏸' : seconds}</span>
        </div>
      </div>

      {/* scrollable grid — newest first, 2 per row (3 on wider screens), floating 3D */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {ads.map((ad, i) => (
            <Tile key={ad.id} ad={ad} delay={(i % 6) * 250} onNavigate={() => setShow(false)} />
          ))}
        </div>
      </div>

      {/* sticky footer controls */}
      <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-black/40 px-4 py-3">
        <button onClick={togglePause} className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/25">
          {paused ? <><Play className="h-4 w-4" /> متابعة</> : <><Pause className="h-4 w-4" /> البقاء</>}
        </button>
        <button onClick={enterSite} className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-primary hover:bg-white/90">
          <LogIn className="h-4 w-4" /> الدخول للموقع
        </button>
      </div>
    </div>
  );
}
