import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { MapPin, Eye, Timer, User, BadgeCheck, Star, Crown, Store } from 'lucide-react';
import type { AdCard as AdCardType } from '@/lib/data';
import { adPriceLabel, compactAdTitle } from '@/lib/ad-presentation';
import { timeAgo, cn } from '@/lib/utils';
import { homeGridClass, pickHomeLayout } from '@/lib/commerce/home-layout';

function timeShort(iso: string | null) {
  const s = timeAgo(iso); // e.g. "قبل 3 يوم"
  return s.replace('قبل ', 'منذ ');
}

/**
 * الصور الخارجية (روابط مباشرة) وصور وسيط CJ (‎/api/cj/img‎) تُعرض بلا معالج next/image
 * لأن المُحسِّن يفشل على تدفّق الوسيط — نفس ما يعمل في صفحة التفاصيل عبر <img> مباشرة.
 */
const rawImg = (src: string) => /^https?:\/\//.test(src) || src.startsWith('/api/');

/** نسبة الخصم عندما يحدد المعلن سعراً قبل الخصم أعلى من السعر الحالي (عروض اليوم). */
function discountPct(ad: AdCardType): number {
  if (ad.priceEnabled === false || !ad.oldPrice || ad.price <= 0 || ad.oldPrice <= ad.price) return 0;
  return Math.round((1 - ad.price / ad.oldPrice) * 100);
}

function DiscountChip({ ad }: { ad: AdCardType }) {
  const pct = discountPct(ad);
  if (!pct) return null;
  return <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">خصم {pct}٪</span>;
}

function OldPrice({ ad }: { ad: AdCardType }) {
  const pct = discountPct(ad);
  if (!pct) return null;
  return <span className="text-[11px] text-muted-foreground line-through" dir="ltr">{new Intl.NumberFormat('en-US').format(ad.oldPrice!)}</span>;
}

// Premium (paid) look per tier — attention-grabbing frame, glow, accent + ribbon.
const PREMIUM = {
  gold: { border: '!border-amber-400', ring: 'ring-2 ring-amber-400/70', glow: 'shadow-sm', tint: '!bg-gradient-to-b !from-amber-50 !to-white', bar: 'from-amber-400 to-amber-600', chip: 'bg-gradient-to-l from-amber-500 to-amber-600', label: 'إعلان ذهبي مميّز' },
  silver: { border: '!border-slate-400', ring: 'ring-2 ring-slate-300', glow: 'shadow-sm', tint: '!bg-gradient-to-b !from-slate-50 !to-white', bar: 'from-slate-300 to-slate-500', chip: 'bg-gradient-to-l from-slate-500 to-slate-600', label: 'إعلان فضي مميّز' },
  special: { border: '', ring: 'ring-2 ring-primary/45', glow: 'shadow-sm', tint: '', bar: 'from-primary to-[hsl(var(--primary)/0.55)]', chip: 'bg-primary', label: 'إعلان مميّز' },
} as const;

export function AdCard({ ad, variant = 'raised' }: { ad: AdCardType; variant?: 'raised' | 'inset' }) {
  const isReq = ad.adsType === 'request';
  const inset = variant === 'inset';
  const tier = ad.tier === 'gold' ? 'gold' : ad.tier === 'silver' ? 'silver' : null;
  const P = tier ? PREMIUM[tier] : ad.special ? PREMIUM.special : null; // paid ads stand out
  return (
    <Link
      href={ad.href ?? `/ads/${ad.id}`}
      className={cn(
        'card-3d relative block overflow-hidden rounded-2xl',
        // المدفوع أولاً: إطار فاخر وتوهّج جذّاب
        P && [ P.border, P.ring, P.glow, P.tint],
        // العادي: تناوب بارز/غائر لإعطاء إيقاع بصري
        !P && !inset && 'ring-1 ring-primary/10',
        !P && inset && '!border-primary/20 bg-secondary/20',
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
      {/* شارة عاجل — مدفوعة ومؤقتة */}
      {ad.urgent && (
        <span className="absolute left-2 top-2 z-20 animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">🔥 عاجل</span>
      )}
      {/* title (right) + image (left) — matches the original layout */}
      <div className="flex items-stretch gap-3 p-3">
        <div className="min-w-0 flex-1">
          <span className="mb-1 inline-flex items-center gap-1">
            <span className={cn('rounded px-2 py-0.5 text-[10px] font-extrabold text-white', isReq ? 'bg-amber-500' : 'bg-primary')}>
              {isReq ? 'طلب' : 'عرض'}
            </span>

          </span>
          <h3 className="line-clamp-2 break-words text-right text-base font-bold leading-6 text-primary">
            {compactAdTitle(ad.title)}
          </h3>
          <CardPrice ad={ad} />
          {ad.storeName && <div className="mt-1 min-w-0"><StoreTag name={ad.storeName} /></div>}
          {(ad.ratingCount ?? 0) > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs font-extrabold text-amber-600">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {ad.ratingAvg}
              <span className="font-normal text-muted-foreground">({ad.ratingCount} تقييم)</span>
              {(ad.ratingAvg ?? 0) >= 4.5 && (ad.ratingCount ?? 0) >= 3 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700">🏆 موصى به</span>
              )}
            </div>
          )}
        </div>
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white">
          <Image src={ad.image} unoptimized={rawImg(ad.image)} alt={compactAdTitle(ad.title)} fill sizes="96px" className="object-cover" />
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
          <span className="mt-1 line-clamp-1 text-xs text-primary/90">{ad.cityName || 'الموقع غير محدد'}</span>
        </Cell>
      </div>
    </Link>
  );
}

function CardPrice({ ad }: { ad: AdCardType }) {
  return <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
    <span className={cn('text-sm font-extrabold', ad.price > 0 ? 'text-primary' : 'text-muted-foreground')}>{adPriceLabel(ad)}</span>
    <OldPrice ad={ad} /><DiscountChip ad={ad} />
  </div>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-start">{children}</div>;
}

/** "من متجر …" label for ads surfaced on the Trbhh platform from a store. */
function StoreTag({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Store className="h-3 w-3 shrink-0" /> <span className="min-w-0 truncate">من متجر {name}</span>
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
    <Link href={ad.href ?? `/ads/${ad.id}`} className="card-3d group flex flex-col overflow-hidden rounded-2xl">
      <div className="relative aspect-square w-full overflow-hidden bg-white">
        <Image src={ad.image} unoptimized={rawImg(ad.image)} alt={compactAdTitle(ad.title)} fill sizes="(max-width:640px) 50vw, 33vw" className="object-cover transition group-hover:scale-105" />
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
        <h3 className="line-clamp-2 min-h-[2.2rem] text-[13px] font-bold leading-snug text-foreground/90">{compactAdTitle(ad.title)}</h3>
        {ad.storeName && <StoreTag name={ad.storeName} />}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {(ad.ratingCount ?? 0) > 0 && <span className="flex items-center gap-0.5 font-extrabold text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {ad.ratingAvg} ({ad.ratingCount})</span>}
          <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {new Intl.NumberFormat('en-US').format(ad.views)}</span>
          {ad.cityName && <span className="flex min-w-0 items-center gap-0.5 truncate"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{ad.cityName}</span></span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-1 pt-0.5">
          <CardPrice ad={ad} />
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
    <Link href={ad.href ?? `/ads/${ad.id}`} className="card-3d flex items-stretch gap-3 overflow-hidden rounded-2xl p-3">
      {/* details (right in RTL) */}
      <div className="flex min-w-0 flex-1 flex-col pl-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white', isReq ? 'bg-amber-500' : 'bg-primary')}>{isReq ? 'طلب' : 'عرض'}</span>
          {ad.special && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">مميّز</span>}
          {ad.storeName && <StoreTag name={ad.storeName} />}
        </div>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground/90">{compactAdTitle(ad.title)}</h3>
        <CardPrice ad={ad} />
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-1.5 text-[11px] text-muted-foreground">
          {(ad.ratingCount ?? 0) > 0 && <span className="flex items-center gap-0.5 font-extrabold text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {ad.ratingAvg} ({ad.ratingCount})</span>}
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
          <Image src={ad.image} unoptimized={rawImg(ad.image)} alt={compactAdTitle(ad.title)} fill sizes="(max-width:640px) 96px, 128px" className="object-cover" />
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

/** Existing marketplace semantics with the approved public-home visual treatment. */
export function AdCardMarketplace({ ad }: { ad: AdCardType }) {
  return <Link href={ad.href ?? `/ads/${ad.id}`} className="marketplace-card group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
      <Image src={ad.image} unoptimized={rawImg(ad.image)} alt={compactAdTitle(ad.title)} fill sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw" className="object-cover transition duration-300 group-hover:scale-105" />
      <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-[#16294a]/95 px-2.5 py-1 text-[10px] font-bold text-white">{ad.adsType === 'request' ? 'مطلوب' : 'معروض'}</span>
        {(ad.special || ad.tier) && <span className="rounded-full bg-[#f0b429] px-2.5 py-1 text-[10px] font-extrabold text-[#16294a]">{ad.tier === 'gold' ? 'إعلان ذهبي مميز' : ad.tier === 'silver' ? 'إعلان فضي مميز' : 'إعلان مميز'}</span>}
        {ad.urgent && <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold text-white">عاجل</span>}
      </div>
    </div>
    <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-1.5"><strong className="text-base font-extrabold text-[#16294a] sm:text-xl">{adPriceLabel(ad)}</strong><OldPrice ad={ad} /><DiscountChip ad={ad} /></div>
      <h3 className="line-clamp-2 min-h-10 break-words text-sm font-bold leading-5 text-slate-800">{compactAdTitle(ad.title)}</h3>
      {ad.storeName && <StoreTag name={ad.storeName} />}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        {ad.cityName && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{ad.cityName}</span>}
        <span>{timeShort(ad.createdAt)}</span>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1">{ad.sellerTrusted && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="بائع موثق" />}<span className="truncate">{ad.sellerName || 'المعلن'}</span></span>
        {(ad.ratingCount ?? 0) > 0 && <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-500" />{ad.ratingAvg} ({ad.ratingCount})</span>}
        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{ad.views}</span>
      </div>
    </div>
  </Link>;
}

export async function AdGrid({ ads, className, appearance }: { ads: AdCardType[]; className?: string; appearance?: 'marketplace' }) {
  if (!ads.length) {
    const { getEmptyText } = await import('@/lib/settings');
    const msg = await getEmptyText('ads').catch(() => 'لا توجد إعلانات لعرضها حالياً.');
    return <p className="py-12 text-center text-muted-foreground">{msg}</p>;
  }
  const design = (await cookies()).get('design')?.value || '';
  if (design === 'shop') {
    return (
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
        {ads.map((ad) => <AdCardShop key={ad.id} ad={ad} />)}
      </div>
    );
  }
  if (design === 'list') {
    return (
      <div className={cn('grid gap-3 lg:grid-cols-2', className)}>
        {ads.map((ad) => <AdCardList key={ad.id} ad={ad} />)}
      </div>
    );
  }
  if (appearance === 'marketplace') {
    return <div className={cn(homeGridClass(pickHomeLayout(ads.length)), 'gap-3 sm:gap-5', className)}>{ads.map(ad => <AdCardMarketplace key={ad.id} ad={ad} />)}</div>;
  }
  return (
    <div className={cn('grid gap-3 lg:grid-cols-2', className)}>
      {ads.map((ad, i) => (
        <AdCard key={ad.id} ad={ad} variant={i % 2 === 0 ? 'raised' : 'inset'} />
      ))}
    </div>
  );
}
