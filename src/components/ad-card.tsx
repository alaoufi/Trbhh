import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { MapPin, Eye, Timer, User, BadgeCheck, Star, Crown, Store } from 'lucide-react';
import type { AdCard as AdCardType } from '@/lib/data';
import { timeAgo, formatPrice, cn } from '@/lib/utils';

function timeShort(iso: string | null) {
  const s = timeAgo(iso); // e.g. "قبل 3 يوم"
  return s.replace('قبل ', 'منذ ');
}

// Premium (paid) look per tier — attention-grabbing frame, glow, accent + ribbon.
const PREMIUM = {
  gold: { border: '!border-amber-400', ring: 'ring-2 ring-amber-400/70', glow: 'shadow-[0_14px_36px_-8px_rgba(245,158,11,0.55)]', tint: '!bg-gradient-to-b !from-amber-50 !to-white', bar: 'from-amber-400 to-amber-600', chip: 'bg-gradient-to-l from-amber-500 to-amber-600', label: 'إعلان ذهبي مميّز' },
  silver: { border: '!border-slate-400', ring: 'ring-2 ring-slate-300', glow: 'shadow-[0_12px_30px_-8px_rgba(100,116,139,0.45)]', tint: '!bg-gradient-to-b !from-slate-50 !to-white', bar: 'from-slate-300 to-slate-500', chip: 'bg-gradient-to-l from-slate-500 to-slate-600', label: 'إعلان فضي مميّز' },
  special: { border: '', ring: 'ring-2 ring-primary/45', glow: 'shadow-[0_12px_30px_-8px_hsl(var(--primary)/0.5)]', tint: '', bar: 'from-primary to-[hsl(var(--primary)/0.55)]', chip: 'bg-primary', label: 'إعلان مميّز' },
} as const;

export function AdCard({ ad, variant = 'raised' }: { ad: AdCardType; variant?: 'raised' | 'inset' }) {
  const isReq = ad.adsType === 'request';
  const inset = variant === 'inset';
  const tier = ad.tier === 'gold' ? 'gold' : ad.tier === 'silver' ? 'silver' : null;
  const P = tier ? PREMIUM[tier] : ad.special ? PREMIUM.special : null; // paid ads stand out
  return (
    <Link
      href={`/ads/${ad.id}`}
      className={cn(
        'card-3d relative block overflow-hidden rounded-2xl',
        // المدفوع أولاً: إطار فاخر وتوهّج جذّاب
        P && ['z-20', P.border, P.ring, P.glow, P.tint],
        // العادي: تناوب بارز/غائر لإعطاء إيقاع بصري
        !P && !inset && 'z-10 ring-2 ring-primary/20',
        !P && inset && 'scale-[0.965] !border-primary/20 bg-secondary/50 !shadow-[inset_0_2px_12px_rgba(0,0,0,0.10)]',
        !P && isReq && '!border-amber-400 bg-amber-50',
      )}
    >
      {/* شريط لوني على حافة البداية (يمين RTL) */}
      {(P || !inset) && <span className={cn('absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b', P ? P.bar : 'from-primary to-[hsl(var(--primary)/0.55)]')} />}

      {/* شريط علوي بارز للإعلان المدفوع */}
      {P && (
        <div className={cn('flex items-center justify-center gap-1 py-1 text-[11px] font-extrabold text-white', P.chip)}>
          {tier === 'gold' ? <Crown className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5 fill-white" />} {P.label}
        </div>
      )}
      {/* title (right) + image (left) — matches the original layout */}
      <div className="flex items-stretch gap-3 p-3">
        <div className="flex-1">
          <span className={cn('mb-1 inline-block rounded px-2 py-0.5 text-[10px] font-extrabold text-white', isReq ? 'bg-amber-500' : 'bg-primary')}>
            {isReq ? 'طلب' : 'عرض'}
          </span>
          <h3 className="line-clamp-3 text-right text-base font-bold leading-7 text-primary">
            {ad.title}
          </h3>
          {ad.storeName && <div className="mt-1"><StoreTag name={ad.storeName} /></div>}
        </div>
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white">
          <Image src={ad.image} alt={ad.title} fill sizes="96px" className="object-cover" />
          {ad.special && (
            <span className="absolute right-1 top-1 rounded bg-[hsl(var(--new))] px-1.5 py-0.5 text-[10px] font-bold text-white">
              مميّز
            </span>
          )}
          {(ad.tier === 'gold' || ad.tier === 'silver') && (
            <span className={`absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full shadow ${ad.tier === 'gold' ? 'bg-amber-400' : 'bg-slate-300'}`} title={ad.tier === 'gold' ? 'باقة ذهبية' : 'باقة فضية'}>
              <Star className={`h-3.5 w-3.5 ${ad.tier === 'gold' ? 'fill-amber-700 text-amber-700' : 'fill-slate-600 text-slate-600'}`} />
            </span>
          )}
        </div>
      </div>

      <div className="mx-3 border-t border-primary/15" />

      {/* footer: seller · time · views · location (RTL) */}
      <div className="grid grid-cols-4 gap-1 p-3 text-center">
        <Cell>
          <span className="relative">
            <User className="icon-badge mx-auto h-6 w-6 text-primary" />
            {ad.sellerTrusted ? (
              <BadgeCheck className="absolute -bottom-1 -left-1 h-3.5 w-3.5 fill-primary text-white" />
            ) : (
              <span className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </span>
          <span className="mt-1 line-clamp-1 text-xs text-primary/90">{ad.sellerName || '—'}</span>
        </Cell>
        <Cell>
          <Timer className="icon-badge mx-auto h-6 w-6 text-primary" />
          <span className="mt-1 line-clamp-1 text-xs text-primary/90">{timeShort(ad.createdAt)}</span>
        </Cell>
        <Cell>
          <Eye className="icon-badge mx-auto h-6 w-6 text-primary" />
          <span className="mt-1 text-xs text-primary/90">{ad.views}</span>
        </Cell>
        <Cell>
          <MapPin className="icon-badge mx-auto h-6 w-6 text-primary" />
          <span className="mt-1 line-clamp-1 text-xs text-primary/90">{ad.cityName || '—'}</span>
        </Cell>
      </div>
    </Link>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-start">{children}</div>;
}

/** "من متجر …" label for ads surfaced on the Trbhh platform from a store. */
function StoreTag({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Store className="h-3 w-3 shrink-0" /> <span className="truncate">من متجر {name}</span>
    </span>
  );
}

/**
 * Shopping-style tile (متجر / Temu-like): big image on top, bold red price,
 * badges, rating-ish meta — used when the member picks the "متجر" design.
 */
export function AdCardShop({ ad }: { ad: AdCardType }) {
  const isReq = ad.adsType === 'request';
  const tier = ad.tier === 'gold' ? 'gold' : ad.tier === 'silver' ? 'silver' : null;
  return (
    <Link href={`/ads/${ad.id}`} className="card-3d group flex flex-col overflow-hidden rounded-2xl">
      <div className="relative aspect-square w-full overflow-hidden bg-white">
        <Image src={ad.image} alt={ad.title} fill sizes="(max-width:640px) 50vw, 33vw" className="object-cover transition group-hover:scale-105" />
        {/* شارات فوق الصورة */}
        <span className={cn('absolute right-0 top-2 rounded-l-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow', isReq ? 'bg-amber-500' : 'bg-primary')}>
          {isReq ? 'طلب' : 'عرض'}
        </span>
        {ad.special && <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">مميّز</span>}
        {tier && (
          <span className={cn('absolute left-2 bottom-2 grid h-6 w-6 place-items-center rounded-full shadow', tier === 'gold' ? 'bg-amber-400' : 'bg-slate-300')}>
            <Star className={cn('h-3.5 w-3.5', tier === 'gold' ? 'fill-amber-700 text-amber-700' : 'fill-slate-600 text-slate-600')} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2">
        <h3 className="line-clamp-2 min-h-[2.2rem] text-[13px] font-bold leading-snug text-foreground/90">{ad.title}</h3>
        {ad.storeName && <StoreTag name={ad.storeName} />}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {new Intl.NumberFormat('en-US').format(ad.views)}</span>
          {ad.cityName && <span className="flex min-w-0 items-center gap-0.5 truncate"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{ad.cityName}</span></span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-1 pt-0.5">
          {ad.price > 0
            ? <span className="truncate text-[15px] font-extrabold text-red-600">{new Intl.NumberFormat('en-US').format(ad.price)} <span className="text-[11px] font-bold">ر.س</span></span>
            : isReq
              ? <span />
              : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">على السوم</span>}
          <span className="shrink-0 text-[9px] text-muted-foreground">{timeShort(ad.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * List row (قائمة / Made-in-China style): a large square image on the left and
 * rich details on the right — title, bold red price, meta and an action pill.
 */
export function AdCardList({ ad }: { ad: AdCardType }) {
  const isReq = ad.adsType === 'request';
  const tier = ad.tier === 'gold' ? 'gold' : ad.tier === 'silver' ? 'silver' : null;
  return (
    <Link href={`/ads/${ad.id}`} className="card-3d flex items-stretch gap-3 overflow-hidden rounded-2xl p-3">
      {/* details (right in RTL) */}
      <div className="flex min-w-0 flex-1 flex-col pl-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white', isReq ? 'bg-amber-500' : 'bg-primary')}>{isReq ? 'طلب' : 'عرض'}</span>
          {ad.special && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">مميّز</span>}
          {ad.storeName && <StoreTag name={ad.storeName} />}
        </div>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground/90">{ad.title}</h3>
        <div className="mt-1 text-base font-extrabold text-red-600">
          {ad.price > 0 ? <>{new Intl.NumberFormat('en-US').format(ad.price)} <span className="text-[11px] font-bold">ر.س</span></> : isReq ? <span className="text-sm font-bold text-muted-foreground">مطلوب</span> : <span className="text-amber-600">على السوم</span>}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {new Intl.NumberFormat('en-US').format(ad.views)}</span>
          {ad.cityName && <span className="flex min-w-0 items-center gap-0.5"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{ad.cityName}</span></span>}
          <span className="flex items-center gap-0.5"><Timer className="h-3 w-3" /> {timeShort(ad.createdAt)}</span>
        </div>
        <span className="mt-2 inline-flex w-fit items-center rounded-full border border-primary/40 px-3 py-1 text-[11px] font-bold text-primary">عرض التفاصيل ←</span>
      </div>

      {/* حاجز فاصل بين التفاصيل والصورة */}
      <span className="w-px self-stretch bg-primary/15" />

      {/* برواز على الصورة — إطار أبيض بحدّ ملوّن وظلّ (يسار RTL) */}
      <div className="shrink-0 self-center rounded-2xl border-2 border-primary/30 bg-white p-1 shadow-md">
        <div className="relative aspect-square w-24 overflow-hidden rounded-xl sm:w-32">
          <Image src={ad.image} alt={ad.title} fill sizes="(max-width:640px) 96px, 128px" className="object-cover" />
          {tier && (
            <span className={cn('absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full shadow', tier === 'gold' ? 'bg-amber-400' : 'bg-slate-300')}>
              <Star className={cn('h-3.5 w-3.5', tier === 'gold' ? 'fill-amber-700 text-amber-700' : 'fill-slate-600 text-slate-600')} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export async function AdGrid({ ads, className }: { ads: AdCardType[]; className?: string }) {
  if (!ads.length) {
    const { getEmptyText } = await import('@/lib/settings');
    const msg = await getEmptyText('ads').catch(() => 'لا توجد إعلانات لعرضها حالياً.');
    return <p className="py-12 text-center text-muted-foreground">{msg}</p>;
  }
  const design = (await cookies()).get('design')?.value || '';
  if (design === 'shop') {
    return (
      <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', className)}>
        {ads.map((ad) => <AdCardShop key={ad.id} ad={ad} />)}
      </div>
    );
  }
  if (design === 'list') {
    return (
      <div className={cn('space-y-3', className)}>
        {ads.map((ad) => <AdCardList key={ad.id} ad={ad} />)}
      </div>
    );
  }
  return (
    <div className={cn('space-y-3', className)}>
      {ads.map((ad, i) => (
        <AdCard key={ad.id} ad={ad} variant={i % 2 === 0 ? 'raised' : 'inset'} />
      ))}
    </div>
  );
}
