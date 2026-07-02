import Image from 'next/image';
import { Phone, MessageCircle, ExternalLink } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES, POS_CLASS, SIZE_TITLE, SIZE_BODY } from '@/lib/classified-theme';

export function ClassifiedCard({ c }: { c: Classified }) {
  const theme = CLASSIFIED_THEMES[c.theme % CLASSIFIED_THEMES.length];
  const dark = theme.text === 'dark' && !c.image;
  const wa = c.whatsapp?.replace(/[^\d]/g, '');

  const content = (
    <div
      className={`relative flex aspect-square flex-col ${POS_CLASS[c.pos]} overflow-hidden rounded-t-2xl ${dark ? 'text-slate-900' : 'text-white'}`}
      style={c.image ? undefined : { backgroundImage: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}
    >
      {c.image && (
        <>
          <Image src={c.image} alt={c.title || 'إعلان'} fill sizes="(max-width:768px) 50vw, 33vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        </>
      )}
      {c.link && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>
      )}
      <div className={`relative z-10 space-y-1 p-3 ${c.align === 'center' ? 'text-center' : 'text-right'}`}>
        {c.title && <h3 className={`line-clamp-3 leading-tight drop-shadow ${SIZE_TITLE[c.size]} ${c.bold ? 'font-extrabold' : 'font-medium'}`}>{c.title}</h3>}
        {c.text && <p className={`line-clamp-4 leading-snug drop-shadow ${SIZE_BODY[c.size]} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{c.text}</p>}
      </div>
    </div>
  );

  return (
    <div className="card-3d overflow-hidden rounded-2xl">
      {c.link ? (
        <a href={c.link} target="_blank" rel="noopener noreferrer" className="block">{content}</a>
      ) : content}

      {(wa || c.phone) && (
        <div className="flex gap-1.5 p-1.5">
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2.5 text-sm font-bold text-white">
              <MessageCircle className="h-5 w-5" /> واتساب
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white">
              <Phone className="h-5 w-5" /> اتصال
            </a>
          )}
        </div>
      )}
    </div>
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
