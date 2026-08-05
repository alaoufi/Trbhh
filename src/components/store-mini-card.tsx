import Link from 'next/link';
import Image from 'next/image';
import { Users, Eye, Star, Megaphone } from 'lucide-react';

export type StoreCardData = {
  id: number; name: string; color: string; logo: string;
  followers: number; views: number; ads: number; rating: number; ratingCount: number;
};

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** Compact store card with key stats — used in collaboration invitations & partners.
 *  compact: نسخة شبكية مضغوطة بارتفاع قليل (لرئيسية عقار تربح) — شعار أصغر وسطر إحصاءات مختصر. */
export function StoreMiniCard({ s, href, compact }: { s: StoreCardData; href?: string; compact?: boolean }) {
  if (compact) {
    return (
      <Link href={href || `/companies/${s.id}`} className="block rounded-lg border border-border/60 bg-white/60 p-2 hover:border-primary/40">
        <div className="flex items-center gap-2">
          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border-2 bg-muted" style={{ borderColor: s.color }}>
            <Image src={s.logo} alt={s.name} fill sizes="36px" className="object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-5" style={{ color: s.color }}>{s.name}</div>
            <div className="flex items-center gap-2 text-[10px] leading-4 text-muted-foreground">
              <span className="flex items-center gap-0.5"><Megaphone className="h-2.5 w-2.5" /> {en(s.ads)}</span>
              <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {s.ratingCount ? s.rating : '—'}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 bg-muted" style={{ borderColor: s.color }}>
          <Image src={s.logo} alt={s.name} fill sizes="48px" className="object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold" style={{ color: s.color }}>{s.name}</div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {en(s.followers)}</span>
            <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {en(s.views)}</span>
            <span className="flex items-center gap-0.5"><Megaphone className="h-3 w-3" /> {en(s.ads)}</span>
            <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {s.ratingCount ? s.rating : '—'}</span>
          </div>
        </div>
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border border-border/60 p-3 hover:border-primary/40">{inner}</Link>
  ) : (
    <div className="rounded-xl border border-border/60 p-3">{inner}</div>
  );
}
