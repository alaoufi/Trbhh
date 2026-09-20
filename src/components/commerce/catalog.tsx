import Link from 'next/link';
import { formatSar } from '@/lib/commerce/money';
import { homeGridClass, type HomeLayout } from '@/lib/commerce/home-layout';

/**
 * الكتالوج البصري لسلع تربح/سلة المعتمدة — بطاقات كحلية/ذهبية، صور كسولة بأبعاد
 * ثابتة (لا قفز تخطيط) مع بديل عند غياب/فشل الصورة، وسعر بالريال محسوب من الهللة.
 * كل النصوص تُعرض كنصّ صِرف (لا HTML خام من المورد). مكوّنات خادمية بالكامل.
 */

export type CommerceCardItem = {
  id: string;
  title: string;
  /** السعر بالهللة (أصغر وحدة) — يُنسَّق بـ formatSar. */
  priceMinor: number;
  /** الكمية المتاحة (٠ = نفدت). */
  stock: number;
  /** رابط صورة واحد (https خارجي للمورد أو مسار محلي) — أو null فيظهر البديل. */
  image: string | null;
  featured?: boolean;
  /** رابط صفحة المنتج. */
  href: string;
  /** هل الشراء متاح (زر «اشترِ») أم مجرّد عرض؟ */
  buyable?: boolean;
  buyLabel?: string;
  viewLabel?: string;
};

/** يستخرج أول رابط صورة آمن (https) من حقل صور المورد (JSON نصّي أو مصفوفة). */
export function firstImageUrl(images: unknown): string | null {
  let values: unknown = images;
  if (typeof images === 'string') {
    try { values = JSON.parse(images); } catch { return null; }
  }
  const url = Array.isArray(values) && typeof values[0] === 'string' ? values[0] : '';
  if (url.startsWith('https://')) return url;
  if (url.startsWith('/media/')) return url; // صورة محلية مخزّنة لدينا
  return null;
}

/** وسائط بأبعاد ثابتة (نسبة ٤:٣) + بديل عند غياب الصورة. الصور تُحمَّل كسولاً. */
function CommerceMedia({ url, title, tall = false }: { url: string | null; title: string; tall?: boolean }) {
  const box = tall ? 'aspect-[4/5]' : 'aspect-[4/3]';
  if (!url) {
    return (
      <div className={`${box} grid w-full place-items-center rounded-xl bg-[#16294a]/5 text-[#16294a]/30`}>
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 18 5-4 4 3 3-2 4 3" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`${box} w-full overflow-hidden rounded-xl bg-[#16294a]/5`}>
      {/* صور المورد الخارجية يحمّلها المتصفّح مباشرةً، لا تُمرَّر عبر خادمنا. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
    </div>
  );
}

/** بطاقة منتج واحدة (شكل شبكة أو مميّز كبير). */
export function CommerceCard({ item, feature = false }: { item: CommerceCardItem; feature?: boolean }) {
  const out = item.stock <= 0;
  return (
    <article className={`group flex ${feature ? 'flex-col sm:flex-row' : 'flex-col'} overflow-hidden rounded-2xl border border-[#f0b429]/30 bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md`}>
      <Link href={item.href} className={`block ${feature ? 'sm:w-1/2' : ''} relative`}>
        <CommerceMedia url={item.image} title={item.title} tall={feature} />
        {item.featured && (
          <span className="absolute right-2 top-2 rounded-full bg-[#f0b429] px-2.5 py-0.5 text-[11px] font-extrabold text-[#16294a] shadow">★ مميّز</span>
        )}
        {out && (
          <span className="absolute left-2 top-2 rounded-full bg-[#16294a] px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow">نفدت الكمية</span>
        )}
      </Link>
      <div className={`flex flex-1 flex-col gap-2 p-3 ${feature ? 'sm:p-5' : ''}`}>
        <Link href={item.href} className={`font-extrabold leading-snug text-[#16294a] hover:text-[#0f1d38] ${feature ? 'text-lg' : 'line-clamp-2 text-sm'}`}>{item.title}</Link>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className={`font-extrabold text-[#16294a] ${feature ? 'text-2xl' : 'text-base'}`}>
            {formatSar(item.priceMinor)} <span className="text-xs font-bold text-[#16294a]/60">ر.س</span>
          </span>
          {item.buyable && !out ? (
            <Link href={item.href} className="rounded-xl bg-gradient-to-l from-[#ff7418] to-[#f0b429] px-4 py-2 text-xs font-extrabold text-[#16294a] shadow transition hover:brightness-105">{item.buyLabel || 'اشترِ الآن'}</Link>
          ) : (
            <Link href={item.href} className="rounded-xl border-2 border-[#16294a]/15 px-4 py-2 text-xs font-extrabold text-[#16294a] transition hover:border-[#16294a]/40">{item.viewLabel || 'التفاصيل'}</Link>
          )}
        </div>
      </div>
    </article>
  );
}

/** شبكة منتجات تتكيّف تلقائيّاً مع التخطيط (عمود واحد مميّز، أو شبكة). */
export function CommerceGrid({ items, layout }: { items: CommerceCardItem[]; layout: HomeLayout }) {
  if (layout.hidden || items.length === 0) return null;
  if (layout.variant === 'feature') {
    return <div className="grid grid-cols-1">{items.slice(0, 1).map((it) => <CommerceCard key={it.id} item={it} feature />)}</div>;
  }
  return (
    <div className={`${homeGridClass(layout)} gap-3`}>
      {items.map((it) => <CommerceCard key={it.id} item={it} />)}
    </div>
  );
}
