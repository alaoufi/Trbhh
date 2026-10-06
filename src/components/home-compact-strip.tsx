import Link from 'next/link';
import {ConfiguredPriceLabel} from './interface-texts';
import Image from 'next/image';
import type {AdCard} from '@/lib/data';
import {adPriceLabel,compactAdTitle} from '@/lib/ad-presentation';
import {AdAdvertiserName} from './ad-advertiser-name';
import {HomeStripScroller} from './home-strip-scroller';

/** Server-rendered cards, progressive scrolling, no cloned ads or extra fetches. */
export function HomeCompactStrip({ads,title,hint,autoPlay=true}:{ads:AdCard[];title:string;hint:string;autoPlay?:boolean}) {
  if(!ads.length)return null;
  return <section data-home-compact-strip className="min-w-0 rounded-xl border border-primary/15 border-t-2 border-t-amber-400 bg-primary/5 p-2">
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-extrabold text-primary">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
    <HomeStripScroller title={title} autoPlay={autoPlay}>
      {ads.map(ad=><Link key={ad.id} href={`/ads/${ad.id}`} className="group flex w-32 shrink-0 flex-col overflow-hidden rounded-lg border border-primary/10 bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:w-40">
        <div className="relative h-16 overflow-hidden bg-secondary/30 sm:h-20">
          <Image src={ad.image} alt={compactAdTitle(ad.title)} fill sizes="160px" className="object-cover" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-1.5">
          <h4 className="line-clamp-2 break-words text-xs font-bold leading-4 text-primary">{compactAdTitle(ad.title)}</h4>
          {ad.priceEnabled!==false&&<p className="break-words text-xs font-extrabold text-primary"><ConfiguredPriceLabel label={adPriceLabel(ad)}/></p>}
          <div className="mt-auto min-w-0 border-t border-primary/10 pt-1.5 [&_span]:line-clamp-2 [&_span]:text-xs [&_span]:leading-4"><AdAdvertiserName name={ad.sellerName} storeName={ad.storeName}/></div>
          {ad.cityName&&<p className="truncate text-xs text-muted-foreground">{ad.cityName}</p>}
        </div>
      </Link>)}
    </HomeStripScroller>
  </section>;
}
