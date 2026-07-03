import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Eye, Timer, Star } from 'lucide-react';
import { timeAgo, cn } from '@/lib/utils';
import type { CatalogStyle } from '@/lib/store-style';

// Minimal structural ad shape the catalog needs (matches the storefront's list).
export type CatalogAd = {
  id: number; title: string; price: number; adsType: string | null; image: string;
  cityName: string | null; createdAt: string | null; special?: boolean | number; views: number; tier?: string | null;
};

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
const timeShort = (iso: string | null) => timeAgo(iso).replace('قبل ', 'منذ ');

/**
 * Store product catalog with merchant-controlled display: pick a layout STYLE
 * and toggle which FIELDS appear (price, city, views, time, badges). Fully
 * independent of the site-wide design cookie.
 */
export function StoreCatalog({ ads, style, fields, brand }: { ads: CatalogAd[]; style: CatalogStyle; fields: Set<string>; brand: string }) {
  const has = (f: string) => fields.has(f);
  const priceEl = (ad: CatalogAd, size = 'text-[15px]') =>
    ad.price > 0
      ? <span className={cn('font-extrabold text-red-600', size)}>{en(ad.price)} <span className="text-[11px] font-bold">ر.س</span></span>
      : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">على السوم</span>;
  const typeBadge = (ad: CatalogAd) => {
    const isReq = ad.adsType === 'request';
    return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white', isReq ? 'bg-amber-500' : 'bg-primary')}>{isReq ? 'طلب' : 'عرض'}</span>;
  };
  const tierBadge = (ad: CatalogAd) => (ad.tier === 'gold' || ad.tier === 'silver') && (
    <span className={cn('grid h-6 w-6 place-items-center rounded-full shadow', ad.tier === 'gold' ? 'bg-amber-400' : 'bg-slate-300')}>
      <Star className={cn('h-3.5 w-3.5', ad.tier === 'gold' ? 'fill-amber-700 text-amber-700' : 'fill-slate-600 text-slate-600')} />
    </span>
  );

  if (!ads.length) return null;

  // ===== شبكة (Temu tiles) =====
  if (style === 'tiles') {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {ads.map((ad) => (
          <Link key={ad.id} href={`/ads/${ad.id}`} className="card-3d group flex flex-col overflow-hidden rounded-2xl">
            <div className="relative aspect-square w-full overflow-hidden bg-white">
              <Image src={ad.image} alt={ad.title} fill sizes="(max-width:640px) 50vw, 33vw" className="object-cover transition group-hover:scale-105" />
              {has('type') && <span className="absolute right-0 top-2">{typeBadge(ad)}</span>}
              {has('special') && ad.special ? <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">مميّز</span> : null}
              <span className="absolute bottom-2 left-2">{tierBadge(ad)}</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2">
              <h3 className="line-clamp-2 min-h-[2.2rem] text-[13px] font-bold leading-snug text-foreground/90">{ad.title}</h3>
              {(has('views') || has('city')) && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {has('views') && <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {en(ad.views)}</span>}
                  {has('city') && ad.cityName && <span className="flex min-w-0 items-center gap-0.5 truncate"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{ad.cityName}</span></span>}
                </div>
              )}
              <div className="mt-auto flex items-end justify-between gap-1 pt-0.5">
                {has('price') ? priceEl(ad) : <span />}
                {has('time') && <span className="shrink-0 text-[9px] text-muted-foreground">{timeShort(ad.createdAt)}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  // ===== معرض (large image, single column) =====
  if (style === 'gallery') {
    return (
      <div className="space-y-3">
        {ads.map((ad) => (
          <Link key={ad.id} href={`/ads/${ad.id}`} className="card-3d block overflow-hidden rounded-2xl">
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-white">
              <Image src={ad.image} alt={ad.title} fill sizes="(max-width:768px) 100vw, 640px" className="object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                <div className="mb-1 flex items-center gap-1.5">
                  {has('type') && typeBadge(ad)}
                  {has('special') && ad.special ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold">مميّز</span> : null}
                </div>
                <h3 className="line-clamp-1 text-base font-bold drop-shadow">{ad.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] opacity-95">
                  {has('price') && priceEl(ad, 'text-base')}
                  {has('views') && <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {en(ad.views)}</span>}
                  {has('city') && ad.cityName && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {ad.cityName}</span>}
                  {has('time') && <span className="flex items-center gap-0.5"><Timer className="h-3 w-3" /> {timeShort(ad.createdAt)}</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  // ===== بطاقات (detailed card) =====
  if (style === 'cards') {
    return (
      <div className="space-y-3">
        {ads.map((ad) => (
          <Link key={ad.id} href={`/ads/${ad.id}`} className="card-3d relative block overflow-hidden rounded-2xl ring-2 ring-primary/15">
            <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: brand }} />
            <div className="flex items-stretch gap-3 p-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-1.5">
                  {has('type') && typeBadge(ad)}
                  {has('special') && ad.special ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">مميّز</span> : null}
                </div>
                <h3 className="line-clamp-3 text-right text-base font-bold leading-7 text-primary">{ad.title}</h3>
                {has('price') && <div className="mt-1">{priceEl(ad)}</div>}
              </div>
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white">
                <Image src={ad.image} alt={ad.title} fill sizes="96px" className="object-cover" />
                <span className="absolute left-1 top-1">{tierBadge(ad)}</span>
              </div>
            </div>
            {(has('views') || has('city') || has('time')) && (
              <>
                <div className="mx-3 border-t border-primary/15" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs text-primary/90">
                  {has('time') && <span className="flex items-center gap-1"><Timer className="h-4 w-4" /> {timeShort(ad.createdAt)}</span>}
                  {has('views') && <span className="flex items-center gap-1"><Eye className="h-4 w-4" /> {en(ad.views)}</span>}
                  {has('city') && ad.cityName && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {ad.cityName}</span>}
                </div>
              </>
            )}
          </Link>
        ))}
      </div>
    );
  }

  // ===== قائمة (image left, details right) =====
  return (
    <div className="space-y-3">
      {ads.map((ad) => (
        <Link key={ad.id} href={`/ads/${ad.id}`} className="card-3d flex items-stretch gap-3 overflow-hidden rounded-2xl p-3">
          <div className="flex min-w-0 flex-1 flex-col pl-3">
            <div className="mb-1 flex items-center gap-1.5">
              {has('type') && typeBadge(ad)}
              {has('special') && ad.special ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">مميّز</span> : null}
            </div>
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground/90">{ad.title}</h3>
            {has('price') && <div className="mt-1">{priceEl(ad, 'text-base')}</div>}
            <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-1.5 text-[11px] text-muted-foreground">
              {has('views') && <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {en(ad.views)}</span>}
              {has('city') && ad.cityName && <span className="flex min-w-0 items-center gap-0.5"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{ad.cityName}</span></span>}
              {has('time') && <span className="flex items-center gap-0.5"><Timer className="h-3 w-3" /> {timeShort(ad.createdAt)}</span>}
            </div>
          </div>
          <span className="w-px self-stretch bg-primary/15" />
          <div className="shrink-0 self-center rounded-2xl border-2 p-1 shadow-md" style={{ borderColor: `${brand}55` }}>
            <div className="relative aspect-square w-24 overflow-hidden rounded-xl sm:w-28">
              <Image src={ad.image} alt={ad.title} fill sizes="(max-width:640px) 96px, 112px" className="object-cover" />
              <span className="absolute left-1 top-1">{tierBadge(ad)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
