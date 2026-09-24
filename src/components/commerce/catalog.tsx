import Link from 'next/link';
import { formatSar } from '@/lib/commerce/money';
import { homeGridClass, type HomeLayout } from '@/lib/commerce/home-layout';
import { PriceText } from '@/components/price-text';

/**
 * الكتالوج البصري لمتجر تربح — بأسلوب متجر معدّات احترافي (كحلي/برتقالي):
 * الصورة هي العنصر الأقوى على خلفية فاتحة، بادج خصم أحمر، اسم واضح، سعر برتقالي
 * بارز مع سعر قديم مشطوب، وزر إجراء بعرضٍ كامل (أضف إلى السلة / عرض الإعلان).
 * كل النصوص نصّ صِرف. مكوّنات خادمية بالكامل.
 */

export type CommerceCardItem = {
  id: string;
  title: string;
  /** السعر بالهللة (أصغر وحدة) — يُنسَّق بـ formatSar. ٠ = بلا سعر («السعر عند التواصل»). */
  priceMinor: number;
  /** سعر قبل الخصم بالهللة (اختياري) — يظهر مشطوباً فوق السعر إن كان أعلى. */
  compareAtMinor?: number | null;
  /** الكمية المتاحة (٠ = نفدت). */
  stock: number;
  /** رابط صورة واحد (https خارجي أو مسار محلي) — أو null فيظهر البديل. */
  image: string | null;
  featured?: boolean;
  rating?: number | null;
  ratingCount?: number | null;
  /** سطر معلومة قصيرة (مثل الموقع/الحالة). */
  info?: string | null;
  /** رابط صفحة المنتج/الإعلان. */
  href: string;
  /** هل الشراء متاح (زر «أضف إلى السلة») أم مجرّد عرض؟ */
  buyable?: boolean;
  buyLabel?: string;
  viewLabel?: string;
};

/** يستخرج أول رابط صورة آمن من حقل صور المورد (JSON نصّي أو مصفوفة). */
export function firstImageUrl(images: unknown): string | null {
  let values: unknown = images;
  if (typeof images === 'string') {
    try { values = JSON.parse(images); } catch { return null; }
  }
  const url = Array.isArray(values) && typeof values[0] === 'string' ? values[0] : '';
  if (url.startsWith('https://')) return url;
  if (url.startsWith('/media/')) return url;
  return null;
}

/** بديل مقصود عند غياب الصورة: تدرّج كحلي + أيقونة ذهبية. */
function MediaFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#16294a] via-[#1c3157] to-[#233a63]">
      <svg viewBox="0 0 24 24" className="h-1/3 max-h-16 min-h-9 w-auto text-[#f0b429]/85" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.9" /><path d="m4 18 5.5-4.5 3.5 2.5 3.5-3L21 18" />
      </svg>
    </div>
  );
}

/** صورة تملأ صندوقها على خلفية فاتحة — تكبير خفيف عند التحويم، تحميل كسول. */
function MediaFill({ url, title }: { url: string | null; title: string }) {
  if (!url) return <MediaFallback />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />;
}

/** قيمة الخصم (بالريال) إن وُجد سعر قديم أعلى. */
function discountSar(item: CommerceCardItem): number {
  if (typeof item.compareAtMinor === 'number' && item.priceMinor > 0 && item.compareAtMinor > item.priceMinor) {
    return Math.round((item.compareAtMinor - item.priceMinor) / 100);
  }
  return 0;
}

/** سعر برتقالي بارز + سعر قديم مشطوب، أو «السعر عند التواصل» عند غياب السعر. */
function PriceBlock({ item }: { item: CommerceCardItem }) {
  if (item.priceMinor <= 0) {
    return <div className="text-base font-extrabold text-[#16294a]">السعر عند التواصل</div>;
  }
  const hasCompare = typeof item.compareAtMinor === 'number' && item.compareAtMinor > item.priceMinor;
  return (
    <div className="flex items-baseline justify-center gap-2">
      {hasCompare && <span className="text-xs font-bold text-[#16294a]/40 line-through">{formatSar(item.compareAtMinor as number)}</span>}
      <PriceText>{formatSar(item.priceMinor)} <span className="text-sm">ر.س</span></PriceText>
    </div>
  );
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path d="M6 6h15l-1.6 9.2a2 2 0 0 1-2 1.7H9.6a2 2 0 0 1-2-1.65L6 4H3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
    </svg>
  );
}

/** زر الإجراء بعرضٍ كامل — «أضف إلى السلة» برتقالي للشراء، أو «عرض» للتفاصيل. */
function FullCta({ item }: { item: CommerceCardItem }) {
  const out = item.stock <= 0;
  if (item.buyable && !out) {
    return (
      <Link href={item.href} className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff6a1a] px-4 py-2 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#f2610f] active:scale-[0.99] sm:py-2.5 sm:text-sm">
        <CartIcon className="h-4 w-4" />{item.buyLabel || 'أضف إلى السلة'}
      </Link>
    );
  }
  return (
    <Link href={item.href} className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16294a] px-4 py-2 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#0f1d38] active:scale-[0.99] sm:py-2.5 sm:text-sm">
      {item.viewLabel || 'عرض التفاصيل'}
    </Link>
  );
}

function Badges({ item }: { item: CommerceCardItem }) {
  const out = item.stock <= 0;
  const off = discountSar(item);
  return (
    <>
      {off > 0 && !out && <span className="absolute right-3 top-3 rounded-full bg-[#e23744] px-3 py-1 text-[11px] font-extrabold text-white shadow">خصم {off}</span>}
      {item.featured && off === 0 && !out && <span className="absolute right-3 top-3 rounded-full bg-[#f0b429] px-3 py-1 text-[11px] font-extrabold text-[#16294a] shadow">مميّز</span>}
      {out && <span className="absolute left-3 top-3 rounded-full bg-[#16294a] px-3 py-1 text-[11px] font-extrabold text-white shadow">نفدت الكمية</span>}
    </>
  );
}

/** بطاقة منتج/إعلان — بأسلوب المرجع: صورة كبيرة، اسم، سعر برتقالي، زر بعرض كامل. */
export function CommerceCard({ item, feature = false }: { item: CommerceCardItem; feature?: boolean }) {
  if (feature) {
    return (
      <article className="group grid h-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-lg sm:grid-cols-2">
        <Link href={item.href} className="relative block aspect-[4/3] overflow-hidden bg-[#eef2f7] sm:aspect-auto sm:min-h-[300px]">
          <MediaFill url={item.image} title={item.title} />
          <Badges item={item} />
        </Link>
        <div className="flex flex-col gap-3 p-5 text-center sm:p-7">
          <Link href={item.href} className="text-lg font-extrabold leading-snug text-[#16294a] hover:text-[#0f1d38] sm:text-2xl">{item.title}</Link>
          {item.info && <p className="text-sm font-semibold text-[#16294a]/55">{item.info}</p>}
          <div className="mt-1"><PriceBlock item={item} /></div>
          <FullCta item={item} />
        </div>
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm ring-1 ring-black/[0.03] transition hover:-translate-y-1 hover:shadow-lg">
      <Link href={item.href} className="relative block aspect-[4/3] overflow-hidden bg-[#eef2f7]">
        <MediaFill url={item.image} title={item.title} />
        <Badges item={item} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3 text-center sm:gap-2.5 sm:p-4">
        <Link href={item.href} className="line-clamp-2 min-h-[2.6em] text-[13px] font-extrabold leading-snug text-[#16294a] hover:text-[#0f1d38] sm:text-sm">{item.title}</Link>
        {item.info && <p className="line-clamp-1 text-xs font-semibold text-[#16294a]/50">{item.info}</p>}
        <div className="mt-0.5 min-h-[1.6em]"><PriceBlock item={item} /></div>
        <FullCta item={item} />
      </div>
    </article>
  );
}

/** شبكة منتجات تتكيّف تلقائيّاً مع التخطيط. */
export function CommerceGrid({ items, layout }: { items: CommerceCardItem[]; layout: HomeLayout }) {
  if (layout.hidden || items.length === 0) return null;
  if (layout.variant === 'feature') {
    return <div className="grid grid-cols-1">{items.slice(0, 1).map((it) => <CommerceCard key={it.id} item={it} feature />)}</div>;
  }
  return (
    <div className={`${homeGridClass(layout)} gap-3 sm:gap-4`}>
      {items.map((it) => <CommerceCard key={it.id} item={it} />)}
    </div>
  );
}

/** Spotlight: بطاقة كبيرة أولى + بطاقات صغيرة بجانبها. */
export function CommerceSpotlight({ items }: { items: CommerceCardItem[] }) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;
  if (rest.length === 0) return <CommerceCard item={lead} feature />;
  const side = rest.slice(0, 4);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CommerceCard item={lead} feature />
      <div className="grid grid-cols-2 gap-4">
        {side.map((it) => <CommerceCard key={it.id} item={it} />)}
      </div>
    </div>
  );
}

/** Carousel: صفّ أفقي قابل للسحب (scroll-snap) — مثالي للجوال. */
export function CommerceCarousel({ items }: { items: CommerceCardItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <div key={it.id} className="w-[68%] shrink-0 snap-start sm:w-[280px]">
          <CommerceCard item={it} />
        </div>
      ))}
    </div>
  );
}
