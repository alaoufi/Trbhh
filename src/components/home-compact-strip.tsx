import Link from 'next/link';
import Image from 'next/image';
import type {AdCard} from '@/lib/data';
import {adPriceLabel,compactAdTitle} from '@/lib/ad-presentation';
import {AdAdvertiserName} from './ad-advertiser-name';

/** Server rendered, native scrolling; no autoplay, cloned ads or extra fetches. */
export function HomeCompactStrip({ads,title,hint}:{ads:AdCard[];title:string;hint:string}) {
  if(!ads.length)return null;
  return <section data-home-compact-strip className="min-w-0 rounded-2xl border border-primary/15 border-t-4 border-t-amber-400 bg-primary/5 p-3 sm:p-4">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-extrabold text-primary">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
    <div role="region" aria-label={title} tabIndex={0} className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-proximity focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {ads.map(ad=><Link key={ad.id} href={`/ads/${ad.id}`} className="group flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-primary/10 bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:w-52">
        <div className="relative h-24 overflow-hidden bg-secondary/30 sm:h-28">
          <Image src={ad.image} alt={compactAdTitle(ad.title)} fill sizes="208px" className="object-cover" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
          <h4 className="line-clamp-2 break-words text-sm font-bold leading-5 text-primary">{compactAdTitle(ad.title)}</h4>
          {ad.priceEnabled!==false&&<p className="break-words text-sm font-extrabold text-primary">{adPriceLabel(ad)}</p>}
          <div className="mt-auto min-w-0 border-t border-primary/10 pt-1.5"><AdAdvertiserName name={ad.sellerName} storeName={ad.storeName}/></div>
          {ad.cityName&&<p className="truncate text-xs text-muted-foreground">{ad.cityName}</p>}
        </div>
      </Link>)}
    </div>
  </section>;
}
