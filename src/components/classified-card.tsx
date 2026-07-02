import Image from 'next/image';
import { Phone, MessageCircle, ExternalLink } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES } from '@/lib/classified-theme';

function targetHref(c: Classified): string | null {
  if (c.link) return c.link;
  const wa = c.whatsapp?.replace(/[^\d]/g, '');
  if (wa) return `https://wa.me/${wa}`;
  if (c.phone) return `tel:${c.phone}`;
  return null;
}

export function ClassifiedCard({ c }: { c: Classified }) {
  const theme = CLASSIFIED_THEMES[c.theme % CLASSIFIED_THEMES.length];
  const href = targetHref(c);
  const external = !!c.link;

  const inner = (
    <div
      className="card-3d group relative flex aspect-square flex-col justify-end overflow-hidden rounded-2xl text-white"
      style={c.image ? undefined : { backgroundImage: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}
    >
      {c.image && (
        <>
          <Image src={c.image} alt={c.title || 'إعلان'} fill sizes="(max-width:768px) 50vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        </>
      )}

      {c.link && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur">
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      )}

      <div className="relative z-10 space-y-1 p-3">
        {c.title && <h3 className="line-clamp-2 text-sm font-extrabold leading-tight drop-shadow">{c.title}</h3>}
        {c.text && <p className="line-clamp-3 text-xs leading-snug text-white/90 drop-shadow">{c.text}</p>}
        <div className="flex items-center gap-2 pt-1">
          {c.whatsapp && <span className="rounded-full bg-[#25D366] p-1"><MessageCircle className="h-3.5 w-3.5" /></span>}
          {c.phone && <span className="rounded-full bg-white/25 p-1 backdrop-blur"><Phone className="h-3.5 w-3.5" /></span>}
        </div>
      </div>
    </div>
  );

  if (!href) return inner;
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="block">
      {inner}
    </a>
  );
}

export function ClassifiedGrid({ items }: { items: Classified[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map((c) => <ClassifiedCard key={c.id} c={c} />)}
    </div>
  );
}
