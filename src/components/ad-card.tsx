import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Eye, Timer, User, BadgeCheck, Star } from 'lucide-react';
import type { AdCard as AdCardType } from '@/lib/data';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

function timeShort(iso: string | null) {
  const s = timeAgo(iso); // e.g. "قبل 3 يوم"
  return s.replace('قبل ', 'منذ ');
}

export function AdCard({ ad }: { ad: AdCardType }) {
  const isReq = ad.adsType === 'request';
  return (
    <Link
      href={`/ads/${ad.id}`}
      className={cn('card-3d block overflow-hidden rounded-2xl', isReq && '!border-amber-400 bg-amber-50')}
    >
      {/* title (right) + image (left) — matches the original layout */}
      <div className="flex items-stretch gap-3 p-3">
        <div className="flex-1">
          <span className={cn('mb-1 inline-block rounded px-2 py-0.5 text-[10px] font-extrabold text-white', isReq ? 'bg-amber-500' : 'bg-primary')}>
            {isReq ? 'طلب' : 'عرض'}
          </span>
          <h3 className="line-clamp-3 text-right text-base font-bold leading-7 text-primary">
            {ad.title}
          </h3>
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

export function AdGrid({ ads, className }: { ads: AdCardType[]; className?: string }) {
  if (!ads.length) {
    return <p className="py-12 text-center text-muted-foreground">لا توجد إعلانات لعرضها حالياً.</p>;
  }
  return (
    <div className={cn('space-y-3', className)}>
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}
