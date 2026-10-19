'use client';
import { useState, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductImageZoom } from '@/components/product-image-zoom';

export function AdGallery({
  images, title, special, adsType,
}: {
  images: string[];
  title: string;
  special?: boolean;
  adsType?: string;
}) {
  const [active, setActive] = useState(0);
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
    <div className="mx-auto w-full min-w-0 max-w-[440px] space-y-2 md:grid md:grid-cols-[52px_minmax(0,1fr)] md:items-start md:gap-2 md:space-y-0">
      {/* main image — swipe to browse, tap to enlarge */}
      <div className="relative min-w-0 md:col-start-2 md:row-start-1">
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative block h-[240px] w-full md:h-[320px] overflow-hidden rounded-2xl border-2 border-primary/20 bg-secondary shadow-sm"
        >
          <ProductImageZoom src={images[active]} onPrevious={n>1?()=>go(-1):undefined} onNext={n>1?()=>go(1):undefined} positionLabel={`${active+1} / ${n}`} alt={title} className="h-full w-full"><Image src={images[active]} alt={title} fill sizes="(max-width:767px) min(100vw, 440px), 380px" className="object-contain" priority /></ProductImageZoom>
          <div className="absolute right-3 top-3 flex gap-1">
            {special && <span className="rounded bg-[hsl(var(--new))] px-2 py-0.5 text-xs font-bold text-white">مميّز</span>}
            {adsType && <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-white">{adsType === 'offer' ? 'عرض' : 'طلب'}</span>}
          </div>
        </div>
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
        <div aria-label="صور الإعلان" className="flex gap-2 overflow-x-auto pb-1 md:col-start-1 md:row-start-1 md:max-h-[320px] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pb-0">
          {images.slice(0, 12).map((img, i) => (
            <button
              type="button"
              key={i}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              aria-label={`عرض الصورة ${i + 1} من ${n}`}
              aria-pressed={i === active}
              className={`relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg border-2 bg-secondary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${i === active ? 'border-primary ring-2 ring-primary/40' : 'border-primary/20 hover:border-primary/50'}`}
            >
              <Image src={img} alt={`${title} ${i + 1}`} fill sizes="52px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
