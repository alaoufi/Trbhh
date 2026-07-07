'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, MessageCircle, ExternalLink, Pause, Play, Home, Sparkles, ArrowRight } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES, POS_CLASS, SIZE_TITLE, SIZE_BODY, SIZE_TITLE_POSTER, SIZE_BODY_POSTER, waLink } from '@/lib/classified-theme';
import { ClassifiedDecor } from '@/components/classified-decor';

const DEFAULT_SECONDS = 5; // fallback when the admin setting is absent

// Compact sizes so text always fits inside the small grid tiles (no clipped letters)
const TILE_TITLE: Record<string, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };
const TILE_BODY: Record<string, string> = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-xs' };

/** The square ad visual, sized for a grid tile (compact) or the focused view (big). */
function Visual({ ad, big }: { ad: Classified; big?: boolean }) {
  const theme = CLASSIFIED_THEMES[ad.theme % CLASSIFIED_THEMES.length];
  const poster = !ad.image;
  const auto = !!ad.image && ad.layout !== 'manual';
  const dark = theme.text === 'dark' && poster;
  const hasText = !!(ad.title || ad.text);
  const titleCls = big ? (poster ? SIZE_TITLE_POSTER[ad.size] : SIZE_TITLE[ad.size]) : (TILE_TITLE[ad.size] || TILE_TITLE.md);
  const bodyCls = big ? (poster ? SIZE_BODY_POSTER[ad.size] : SIZE_BODY[ad.size]) : (TILE_BODY[ad.size] || TILE_BODY.md);
  return (
    <div
      className={`relative flex aspect-square flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20 ${poster ? 'justify-center' : auto ? 'justify-end' : POS_CLASS[ad.pos]} ${dark ? 'text-slate-900' : 'text-white'}`}
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
      {auto && hasText ? (
        <div className={`relative z-10 ${big ? 'p-3' : 'p-2'}`}>
          <div className={`rounded-xl bg-black/45 text-center backdrop-blur-sm ${big ? 'p-4' : 'p-2'}`}>
            {ad.title && <h3 className={`min-w-0 break-words leading-tight drop-shadow line-clamp-2 ${titleCls} ${ad.bold ? 'font-extrabold' : 'font-semibold'}`}>{ad.title}</h3>}
            {ad.text && <p className={`mt-0.5 min-w-0 break-words leading-snug text-white/90 drop-shadow line-clamp-2 ${bodyCls}`}>{ad.text}</p>}
          </div>
        </div>
      ) : (
        <div className={`relative z-10 flex max-h-full min-h-0 flex-col justify-center gap-1 overflow-hidden ${big ? 'p-6' : 'p-3'} ${poster ? 'text-center' : ad.align === 'center' ? 'text-center' : 'text-right'}`}>
          {ad.title && <h3 className={`min-w-0 break-words leading-tight drop-shadow ${big ? 'line-clamp-5' : 'line-clamp-3'} ${titleCls} ${ad.bold ? 'font-extrabold' : 'font-semibold'}`}>{ad.title}</h3>}
          {ad.text && <p className={`min-w-0 break-words leading-snug drop-shadow ${big ? 'line-clamp-4' : 'line-clamp-2'} ${bodyCls} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{ad.text}</p>}
        </div>
      )}
    </div>
  );
}

function Contact({ ad, big }: { ad: Classified; big?: boolean }) {
  const wa = waLink(ad.whatsapp);
  if (!wa && !ad.phone) return null;
  const sz = big ? 'py-3 text-sm' : 'py-2 text-xs';
  const ic = big ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <div className="mt-1 flex gap-1.5">
      {ad.phone && <a href={`tel:${ad.phone}`} className={`flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 font-bold text-white ${sz}`}><Phone className={ic} /> اتصال</a>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#25D366] font-bold text-white ${sz}`}><MessageCircle className={ic} /> واتساب</a>}
    </div>
  );
}

export function ClassifiedSplash({ ads, seconds }: { ads: Classified[]; seconds?: number }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const durationMs = (seconds && seconds > 0 ? seconds : DEFAULT_SECONDS) * 1000; // مدة التشغيل — من إعدادات الإدارة
  const [remaining, setRemaining] = useState(durationMs);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState<Classified | null>(null);
  const pausedRef = useRef(false);
  const focusedRef = useRef(false);
  const total = ads.length;

  useEffect(() => {
    if (!total) return;
    // تظهر مرة واحدة فقط عند دخول الموقع — لا تتكرر مع التحديث أو التنقل داخل الموقع
    // (تُعاد فقط في زيارة جديدة/تبويب جديد). sessionStorage يبقى طوال الجلسة.
    try {
      if (sessionStorage.getItem('trbhh_splash_seen') === '1') return;
      sessionStorage.setItem('trbhh_splash_seen', '1');
    } catch {
      /* storage unavailable → اعرضها كالمعتاد */
    }
    setShow(true);
    let last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (pausedRef.current || focusedRef.current) return; // freeze countdown while viewing one ad
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
  function openAd(ad: Classified) {
    focusedRef.current = true; // pause auto-dismiss while zoomed on one ad
    setFocused(ad);
  }
  function closeAd() {
    focusedRef.current = false;
    setFocused(null);
  }
  function enterSite() {
    setShow(false);
    router.push('/'); // go to the regular ads home page
  }

  if (!total || !show) return null;

  const progress = remaining / durationMs;
  const R = 18;
  const C = 2 * Math.PI * R;
  const secondsLeft = Math.ceil(remaining / 1000);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-primary via-[hsl(var(--primary)/0.9)] to-slate-900 backdrop-blur-md">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/15 bg-black/10 px-4 py-3">
        {focused ? (
          <button onClick={closeAd} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25">
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
        ) : (
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <span className="text-sm font-bold">الإعلانات المبوّبة</span>
          </div>
        )}
        <div className="relative h-11 w-11">
          <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
            <circle cx="22" cy="22" r={R} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset 60ms linear' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{focused || paused ? '⏸' : secondsLeft}</span>
        </div>
      </div>

      {/* body: focused single ad (enlarged) OR the grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {focused ? (
          <div className="mx-auto max-w-sm">
            {focused.link ? (
              <a href={`/classified/${focused.id}/go`} className="block"><Visual ad={focused} big /></a>
            ) : (
              <Visual ad={focused} big />
            )}
            <Contact ad={focused} big />
            {focused.link && (
              <a href={`/classified/${focused.id}/go`} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-primary">
                <ExternalLink className="h-5 w-5" /> زيارة الرابط
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              {ads.map((ad, i) => (
                <div key={ad.id} className="float-3d" style={{ animationDelay: `${(i % 6) * 250}ms` }}>
                  {/* الضغط يكبّر الإعلان وحده مع سهم الرجوع — بدون انتقال صفحة (لا وميض) */}
                  <button onClick={() => openAd(ad)} className="block w-full text-right"><Visual ad={ad} /></button>
                  <Contact ad={ad} />
                </div>
              ))}
            </div>
            {/* تحت آخر إعلان — بارز وقريب من العين (زر واحد فقط بلا تكرار) */}
            <div className="mx-auto mt-7 flex max-w-2xl flex-col items-center gap-2 pb-4">
              <button onClick={enterSite} className="flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-base font-extrabold text-slate-900 shadow-xl ring-1 ring-amber-200/60 hover:bg-amber-300">
                <Home className="h-5 w-5" /> الصفحة الرئيسية
              </button>
              <button onClick={togglePause} className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25">
                {paused ? <><Play className="h-4 w-4" /> متابعة</> : <><Pause className="h-4 w-4" /> البقاء</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
