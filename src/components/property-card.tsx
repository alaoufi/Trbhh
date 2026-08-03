import Link from 'next/link';
import Image from 'next/image';
import { MapPin, BedDouble, Bath, Ruler } from 'lucide-react';
import type { AdCard } from '@/lib/data';
import { formatPrice, timeAgo } from '@/lib/utils';

function purposeInfo(ad: AdCard): { label: string; cls: string } | null {
  if (ad.adsType === 'request') return { label: 'مطلوب', cls: 'bg-amber-500' };
  if (ad.purpose === 'rent') return { label: 'للإيجار', cls: 'bg-sky-600' };
  if (ad.purpose === 'sale' || ad.price > 0) return { label: 'للبيع', cls: 'bg-emerald-600' };
  return null;
}

/** بطاقة عقار بأسلوب تطبيقات العقار (عقار/بيوت): صورة + غرض + سعر بارز + مواصفات. */
export function PropertyCard({ ad }: { ad: AdCard }) {
  const purpose = purposeInfo(ad);
  const specs = [
    ad.reBeds != null ? { icon: BedDouble, val: ad.reBeds, unit: '' } : null,
    ad.reBaths != null ? { icon: Bath, val: ad.reBaths, unit: '' } : null,
    ad.reArea != null ? { icon: Ruler, val: ad.reArea, unit: 'م²' } : null,
  ].filter(Boolean) as { icon: React.ElementType; val: number; unit: string }[];

  return (
    <Link href={`/ads/${ad.id}`} className="card-3d group overflow-hidden rounded-2xl transition hover:border-primary">
      <div className="relative h-44 w-full bg-secondary">
        <Image src={ad.image} alt={ad.title} fill sizes="(max-width:640px) 100vw, 33vw" className="object-cover transition group-hover:scale-[1.03]" />
        <div className="absolute right-2 top-2 flex gap-1">
          {purpose && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow ${purpose.cls}`}>{purpose.label}</span>}
        </div>
        {ad.reType && <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-primary shadow">{ad.reType}</span>}
        {ad.urgent && <span className="absolute bottom-2 left-2 animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">🔥 عاجل</span>}
      </div>
      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-extrabold text-emerald-700">{ad.price > 0 ? formatPrice(ad.price) : (ad.adsType === 'request' ? 'مطلوب' : 'على السوم')}</span>
          {ad.price > 0 && ad.purpose === 'rent' && <span className="text-[11px] font-bold text-muted-foreground">/ الفترة</span>}
        </div>
        <div className="mt-1 line-clamp-1 text-sm font-bold text-foreground">{ad.title}</div>
        {ad.cityName && <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {ad.cityName}</div>}
        {specs.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-primary/10 pt-2 text-xs font-bold text-foreground/80">
            {specs.map((s, i) => (
              <span key={i} className="flex items-center gap-1"><s.icon className="h-4 w-4 text-primary" /> {s.val}{s.unit ? ` ${s.unit}` : ''}</span>
            ))}
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground">{timeAgo(ad.createdAt).replace('قبل ', 'منذ ')}</div>
      </div>
    </Link>
  );
}

/** شبكة بطاقات العقار (بأسلوب عقار). */
export function PropertyGrid({ ads }: { ads: AdCard[] }) {
  if (!ads.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ads.map((ad) => <PropertyCard key={ad.id} ad={ad} />)}
    </div>
  );
}
