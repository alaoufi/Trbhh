'use client';
import { useEffect, useState } from 'react';
import { Phone, MessageCircle, ExternalLink, X } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES } from '@/lib/classified-theme';

const DURATION = 5000; // ms shown before auto-dismiss

export function ClassifiedSplash({ ad }: { ad: Classified | null }) {
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!ad) return;
    if (sessionStorage.getItem('trbhh_splash') === '1') return;
    sessionStorage.setItem('trbhh_splash', '1');
    setShow(true);
    const start = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / DURATION);
      setProgress(p);
      if (p >= 1) { clearInterval(iv); setShow(false); }
    }, 50);
    return () => clearInterval(iv);
  }, [ad]);

  if (!ad || !show) return null;
  const theme = CLASSIFIED_THEMES[ad.theme % CLASSIFIED_THEMES.length];
  const wa = ad.whatsapp?.replace(/[^\d]/g, '');
  const href = ad.link || (wa ? `https://wa.me/${wa}` : ad.phone ? `tel:${ad.phone}` : null);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-black/80 p-6 backdrop-blur-sm">
      <button onClick={() => setShow(false)} className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white">
        تخطّي <X className="h-4 w-4" />
      </button>

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

      <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
        <div className="h-full bg-white transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="text-xs text-white/70">إعلان — ينتقل للموقع تلقائياً</p>
    </div>
  );
}
