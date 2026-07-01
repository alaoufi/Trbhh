import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Eye, Star, BadgeCheck } from 'lucide-react';
import type { AdCard as AdCardType } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { formatPrice, timeAgo } from '@/lib/utils';

export function AdCard({ ad }: { ad: AdCardType }) {
  return (
    <Link
      href={`/ads/${ad.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={ad.image}
          alt={ad.title}
          fill
          sizes="(max-width:768px) 50vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute right-2 top-2 flex gap-1">
          {ad.special && <Badge variant="special"><Star className="h-3 w-3" /> مميّز</Badge>}
          <Badge variant={ad.adsType === 'offer' ? 'trusted' : 'muted'}>
            {ad.adsType === 'offer' ? 'عرض' : 'طلب'}
          </Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5">{ad.title}</h3>
        <div className="mt-auto flex items-center justify-between">
          <span className="font-bold text-primary">{formatPrice(ad.price)}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" /> {ad.views}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {ad.cityName || 'غير محدد'}
          </span>
          <span>{timeAgo(ad.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export function AdGrid({ ads }: { ads: AdCardType[] }) {
  if (!ads.length) {
    return <p className="py-12 text-center text-muted-foreground">لا توجد إعلانات لعرضها حالياً.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}
