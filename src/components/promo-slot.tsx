import { ExternalLink, Phone, MessageCircle } from 'lucide-react';
import { getActivePromos } from '@/lib/promos';
import { PLACEMENT_RATIO, type Promo, type PromoPlacement } from '@/lib/promo-placements';

function bannerHref(p: Promo): string | null {
  if (p.link) return `/promo/${p.id}/go`;
  const wa = p.whatsapp?.replace(/[^\d]/g, '');
  if (wa) return `https://wa.me/${wa}`;
  if (p.phone) return `tel:${p.phone}`;
  return null;
}

function Banner({ p }: { p: Promo }) {
  const ratio = PLACEMENT_RATIO[p.placement] || '3 / 1';
  const wa = p.whatsapp?.replace(/[^\d]/g, '');
  const inner = (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden text-center text-white" style={{ aspectRatio: ratio }}>
      {p.image && (
        <>
          {/* plain img preserves animated GIFs */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt={p.title || 'إعلان'} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
        </>
      )}
      {!p.image && <div className="absolute inset-0 bg-gradient-to-br from-primary to-[#1b4f8a]" />}
      <div className="relative z-10 space-y-1 p-4">
        {p.title && <div className="text-lg font-extrabold drop-shadow sm:text-2xl">{p.title}</div>}
        {p.body && <div className="text-xs opacity-90 drop-shadow sm:text-sm">{p.body}</div>}
      </div>
      <span className="absolute left-2 top-2 z-10 rounded-full bg-white/25 px-2 py-0.5 text-[10px] backdrop-blur">إعلان</span>
      {(wa || p.phone) && (
        <span className="absolute bottom-2 left-2 z-10 flex gap-1">
          {p.phone && <span className="grid h-7 w-7 place-items-center rounded-full bg-red-600"><Phone className="h-3.5 w-3.5" /></span>}
          {wa && <span className="grid h-7 w-7 place-items-center rounded-full bg-[#25D366]"><MessageCircle className="h-3.5 w-3.5" /></span>}
        </span>
      )}
      {p.link && <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>}
    </div>
  );

  const href = bannerHref(p);
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-primary/20 shadow-sm">
      {href ? <a href={href} target={p.link ? undefined : '_blank'} rel="noopener noreferrer" className="block">{inner}</a> : inner}
    </div>
  );
}

/** Render the active paid banner for a placement (null when none). */
export async function PromoSlot({ placement }: { placement: PromoPlacement }) {
  const promos = await getActivePromos(placement, 5).catch(() => []);
  if (!promos.length) return null;
  return <Banner p={promos[0]} />;
}
