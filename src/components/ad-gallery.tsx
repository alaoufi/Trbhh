'use client';
import { useState, useRef } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

export function AdGallery({
  images, title, special, adsType,
}: {
  images: string[];
  title: string;
  special?: boolean;
  adsType?: string;
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const touchX = useRef<number | null>(null);
  if (!images?.length) return null;
  const n = images.length;
  const go = (d: number) => setActive((a) => (a + d + n) % n);

  // تمرير الإصبع يميناً/يساراً للتنقل بين الصور (السحب يساراً = التالي، يميناً = السابق)
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || n < 2) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div className="space-y-2">
      {/* main image — swipe to browse, tap to enlarge */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-primary/20 bg-secondary shadow-sm"
        >
          <Image src={images[active]} alt={title} fill sizes="(max-width:1024px) 100vw, 66vw" className="object-contain" priority />
          <div className="absolute right-3 top-3 flex gap-1">
            {special && <span className="rounded bg-[hsl(var(--new))] px-2 py-0.5 text-xs font-bold text-white">مميّز</span>}
            {adsType && <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-white">{adsType === 'offer' ? 'عرض' : 'طلب'}</span>}
          </div>
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
            <Maximize2 className="h-3 w-3" /> {active + 1}/{n} · اضغط للتكبير
          </span>
        </button>
        {/* أسهم تنقّل مباشرة على الصورة (دون فتح المكبّر) */}
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(1)} aria-label="التالي" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white backdrop-blur transition hover:bg-black/65">
              <ChevronRight className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => go(-1)} aria-label="السابق" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white backdrop-blur transition hover:bg-black/65">
              <ChevronLeft className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* thumbnails */}
      {n > 1 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.slice(0, 12).map((img, i) => (
            <button
              type="button"
              key={i}
              onClick={() => setActive(i)}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-secondary transition hover:-translate-y-0.5 ${i === active ? 'border-primary ring-2 ring-primary/40' : 'border-primary/20 hover:border-primary/50'}`}
            >
              <Image src={img} alt={`${title} ${i + 1}`} fill sizes="20vw" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* fullscreen lightbox */}
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90" onClick={() => setOpen(false)}>
          <button className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-label="إغلاق">
            <X className="h-6 w-6" />
          </button>
          {n > 1 && (
            <>
              <button className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="التالي">
                <ChevronRight className="h-7 w-7" />
              </button>
              <button className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="السابق">
                <ChevronLeft className="h-7 w-7" />
              </button>
            </>
          )}
          <div
            className="relative h-[85vh] w-[92vw]"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Image src={images[active]} alt={title} fill sizes="92vw" className="object-contain" />
          </div>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm text-white">{active + 1} / {n}</span>
        </div>
      )}
    </div>
  );
}
