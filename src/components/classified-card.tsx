import Image from 'next/image';
import Link from 'next/link';
import { Phone, MessageCircle, ExternalLink } from 'lucide-react';
import { type Classified, CLASSIFIED_THEMES, POS_CLASS, SIZE_TITLE, SIZE_BODY, SIZE_TITLE_POSTER, SIZE_BODY_POSTER, waLink } from '@/lib/classified-theme';
import { ClassifiedDecor } from '@/components/classified-decor';

/** The square ad visual (image/text card). `big` uses larger fonts for the detail view. */
export function ClassifiedVisual({ c, big = false }: { c: Classified; big?: boolean }) {
  const theme = CLASSIFIED_THEMES[c.theme % CLASSIFIED_THEMES.length];
  const dark = theme.text === 'dark' && !c.image;
  const poster = !c.image; // text-only → big, centered
  const auto = !!c.image && c.layout !== 'manual'; // smart tidy arrangement over the image
  const titleCls = poster ? SIZE_TITLE_POSTER[c.size] : SIZE_TITLE[c.size];
  const bodyCls = poster ? SIZE_BODY_POSTER[c.size] : SIZE_BODY[c.size];
  const hasText = !!(c.title || c.text);
  return (
    <div
      className={`relative flex aspect-square flex-col overflow-hidden rounded-t-2xl ${poster ? 'justify-center' : auto ? 'justify-end' : POS_CLASS[c.pos]} ${dark ? 'text-slate-900' : 'text-white'}`}
      style={c.image ? undefined : { backgroundImage: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}
    >
      {c.image && (
        <>
          <Image src={c.image} alt={c.title || 'إعلان'} fill sizes={big ? '(max-width:768px) 100vw, 480px' : '(max-width:768px) 50vw, 33vw'} className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        </>
      )}
      <ClassifiedDecor pattern={c.pattern} accent={c.accent} dark={dark} />
      {c.link && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 p-1 backdrop-blur"><ExternalLink className="h-3.5 w-3.5" /></span>
      )}
      {auto && hasText ? (
        // ترتيب تلقائي أنيق: لوحة نصية شفافة أسفل الصورة
        <div className={`relative z-10 ${big ? 'p-3' : 'p-2'}`}>
          <div className={`rounded-xl bg-black/45 text-center backdrop-blur-sm ${big ? 'p-4' : 'p-2.5'}`}>
            {c.title && <h3 className={`leading-tight drop-shadow ${big ? 'line-clamp-3' : 'line-clamp-2'} ${titleCls} ${c.bold ? 'font-extrabold' : 'font-semibold'}`}>{c.title}</h3>}
            {c.text && <p className={`mt-0.5 leading-snug text-white/90 drop-shadow ${big ? 'line-clamp-3' : 'line-clamp-2'} ${bodyCls}`}>{c.text}</p>}
          </div>
        </div>
      ) : (
        <div className={`relative z-10 space-y-1.5 ${big ? 'p-6' : 'p-4'} ${poster ? 'text-center' : c.align === 'center' ? 'text-center' : 'text-right'}`}>
          {c.title && <h3 className={`leading-tight drop-shadow ${poster ? 'line-clamp-5' : 'line-clamp-4'} ${titleCls} ${c.bold ? 'font-extrabold' : 'font-medium'}`}>{c.title}</h3>}
          {c.text && <p className={`leading-snug drop-shadow ${poster ? 'line-clamp-4' : 'line-clamp-6'} ${bodyCls} ${dark ? 'text-slate-700' : 'text-white/90'}`}>{c.text}</p>}
        </div>
      )}
    </div>
  );
}

/** Contact buttons (whatsapp/phone) shared by card + detail. */
export function ClassifiedContact({ c }: { c: Classified }) {
  const wa = waLink(c.whatsapp);
  if (!wa && !c.phone) return null;
  return (
    <div className="flex gap-1.5 p-1.5">
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#25D366] py-1.5 text-xs font-bold text-white">
          <MessageCircle className="h-3.5 w-3.5" /> واتساب
        </a>
      )}
      {c.phone && (
        <a href={`tel:${c.phone}`} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 py-1.5 text-xs font-bold text-white">
          <Phone className="h-3.5 w-3.5" /> اتصال
        </a>
      )}
    </div>
  );
}

export function ClassifiedCard({ c, i = 0, float = true }: { c: Classified; i?: number; float?: boolean }) {
  return (
    <div
      className={`card-3d overflow-hidden rounded-2xl ${float ? 'float-3d' : ''}`}
      style={float ? { animationDelay: `${(i % 6) * 260}ms` } : undefined}
    >
      {/* الضغط على الإعلان يفتحه مكبّراً في صفحته */}
      <Link href={`/classified/${c.id}`} className="block"><ClassifiedVisual c={c} /></Link>
      <ClassifiedContact c={c} />
    </div>
  );
}

export function ClassifiedGrid({ items, float = true }: { items: Classified[]; float?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map((c, i) => <ClassifiedCard key={c.id} c={c} i={i} float={float} />)}
    </div>
  );
}
