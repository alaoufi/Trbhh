import Link from 'next/link';
import { formatSar } from '@/lib/commerce/money';
import { homeGridClass, type HomeLayout } from '@/lib/commerce/home-layout';

/**
 * الكتالوج البصري لسلع تربح/سلة المعتمدة — بطاقات كحلية/ذهبية، والصورة هي العنصر
 * الأقوى: كبيرة واضحة بأبعاد ثابتة (لا قفز تخطيط) مع بديلٍ **مقصود** (تدرّج كحلي +
 * أيقونة ذهبية) عند غيابها. بطاقة كاملة: صورة كبيرة، اسم، تقييم، سعر بالريال، شارة،
 * وزر شراء واضح. أشكال متعدّدة: شبكة، بطاقة مميّزة كبيرة (Spotlight)، وصفّ أفقي
 * قابل للسحب (Carousel). كل النصوص نصّ صِرف. مكوّنات خادمية بالكامل.
 */

export type CommerceCardItem = {
  id: string;
  title: string;
  /** السعر بالهللة (أصغر وحدة) — يُنسَّق بـ formatSar. */
  priceMinor: number;
  /** سعر قبل الخصم بالهللة (اختياري) — يظهر مشطوباً فوق السعر إن كان أعلى. */
  compareAtMinor?: number | null;
  /** الكمية المتاحة (٠ = نفدت). */
  stock: number;
  /** رابط صورة واحد (https خارجي للمورد أو مسار محلي) — أو null فيظهر البديل. */
  image: string | null;
  featured?: boolean;
  /** تقييم من ٥ (اختياري) — يظهر نجوماً ذهبية. */
  rating?: number | null;
  /** عدد المراجعات (اختياري) — يظهر بجانب التقييم. */
  ratingCount?: number | null;
  /** سطر معلومة قصيرة (مثل اسم المتجر أو «شحن مجاني»). */
  info?: string | null;
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

/** بديل مقصود عند غياب الصورة: تدرّج كحلي + أيقونة ذهبية (لا مساحة باهتة). */
function MediaFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#16294a] via-[#1c3157] to-[#233a63]">
      <svg viewBox="0 0 24 24" className="h-1/3 max-h-16 min-h-9 w-auto text-[#f0b429]/85" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.9" /><path d="m4 18 5.5-4.5 3.5 2.5 3.5-3L21 18" />
      </svg>
    </div>
  );
}

/** صورة تملأ صندوقها (الأب relative بأبعاد ثابتة) — تكبير عند التحويم، تحميل كسول. */
function MediaFill({ url, title }: { url: string | null; title: string }) {
  if (!url) return <MediaFallback />;
  // صور المورد الخارجية يحمّلها المتصفّح مباشرةً، لا تُمرَّر عبر خادمنا.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />;
}

/** نجوم تقييم ذهبية مضغوطة (من ٥) + عدد المراجعات إن وُجد. */
function Rating({ value, count }: { value?: number | null; count?: number | null }) {
  if (!value || value <= 0) return null;
  const full = Math.round(Math.min(5, Math.max(0, value)));
  return (
    <div className="flex items-center gap-1 text-[11px] font-bold text-[#16294a]/70" aria-label={`تقييم ${value} من ٥`}>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${i < full ? 'text-[#f0b429]' : 'text-[#16294a]/15'}`} fill="currentColor" aria-hidden="true">
            <path d="M10 1.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L10 15l-5.25 2.7 1-5.85L1.5 7.65l5.9-.85z" />
          </svg>
        ))}
      </span>
      {count ? <span>({count})</span> : null}
    </div>
  );
}

/** السعر بالريال + سعر مشطوب اختياري (إن كان الأصل أعلى). */
function Price({ item, big = false }: { item: CommerceCardItem; big?: boolean }) {
  const hasCompare = typeof item.compareAtMinor === 'number' && item.compareAtMinor > item.priceMinor;
  return (
    <div className="flex flex-col leading-none">
      {hasCompare && (
        <span className={`font-bold text-[#16294a]/40 line-through ${big ? 'text-sm' : 'text-xs'}`}>
          {formatSar(item.compareAtMinor as number)} ر.س
        </span>
      )}
      <span className={`font-extrabold text-[#16294a] ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
        {formatSar(item.priceMinor)} <span className="text-xs font-bold text-[#16294a]/55">ر.س</span>
      </span>
    </div>
  );
}

/** الشارات: مميّز (ذهبي)، نفدت الكمية (كحلي)، ونسبة الخصم (برتقالي) إن وُجدت. */
function Badges({ item }: { item: CommerceCardItem }) {
  const out = item.stock <= 0;
  const off = typeof item.compareAtMinor === 'number' && item.compareAtMinor > item.priceMinor
    ? Math.round((1 - item.priceMinor / item.compareAtMinor) * 100)
    : 0;
  return (
    <>
      {item.featured && <span className="absolute right-2.5 top-2.5 rounded-full bg-[#f0b429] px-2.5 py-1 text-[11px] font-extrabold text-[#16294a] shadow-md">★ مميّز</span>}
      {off > 0 && !out && <span className="absolute left-2.5 top-2.5 rounded-full bg-[#ff7418] px-2.5 py-1 text-[11px] font-extrabold text-white shadow-md">خصم {off}%</span>}
      {out && <span className="absolute left-2.5 top-2.5 rounded-full bg-[#16294a] px-2.5 py-1 text-[11px] font-extrabold text-white shadow-md">نفدت الكمية</span>}
    </>
  );
}

function CtaButton({ item }: { item: CommerceCardItem }) {
  const out = item.stock <= 0;
  if (item.buyable && !out) {
    return (
      <Link href={item.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#ff7418] to-[#f0b429] px-4 py-2.5 text-sm font-extrabold text-[#16294a] shadow-sm transition hover:brightness-105 active:scale-[0.98]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></svg>
        {item.buyLabel || 'اشترِ الآن'}
      </Link>
    );
  }
  return (
    <Link href={item.href} className="inline-flex shrink-0 items-center rounded-xl border-2 border-[#16294a]/15 px-4 py-2 text-sm font-extrabold text-[#16294a] transition hover:border-[#16294a]/40">
      {item.viewLabel || 'التفاصيل'}
    </Link>
  );
}

/** بطاقة منتج واحدة — شكل شبكة أو مميّز كبير (Spotlight). */
export function CommerceCard({ item, feature = false }: { item: CommerceCardItem; feature?: boolean }) {
  if (feature) {
    return (
      <article className="group grid h-full overflow-hidden rounded-3xl border border-[#f0b429]/40 bg-white shadow-md ring-1 ring-black/5 transition hover:shadow-xl sm:grid-cols-2">
        <Link href={item.href} className="relative block aspect-[4/3] overflow-hidden bg-[#16294a] sm:aspect-auto sm:min-h-[340px]">
          <MediaFill url={item.image} title={item.title} />
          <Badges item={item} />
        </Link>
        <div className="flex flex-col gap-3 p-5 sm:p-7">
          <Rating value={item.rating} count={item.ratingCount} />
          <Link href={item.href} className="text-xl font-extrabold leading-snug text-[#16294a] hover:text-[#0f1d38] sm:text-2xl">{item.title}</Link>
          {item.info && <p className="text-sm font-semibold text-[#16294a]/60">{item.info}</p>}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
            <Price item={item} big />
            <CtaButton item={item} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#f0b429]/25 bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-lg">
      <Link href={item.href} className="relative block aspect-[4/3] overflow-hidden bg-[#16294a]">
        <MediaFill url={item.image} title={item.title} />
        <Badges item={item} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <Rating value={item.rating} count={item.ratingCount} />
        <Link href={item.href} className="line-clamp-2 min-h-[2.6em] text-sm font-extrabold leading-snug text-[#16294a] hover:text-[#0f1d38]">{item.title}</Link>
        {item.info && <p className="line-clamp-1 text-xs font-semibold text-[#16294a]/55">{item.info}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Price item={item} />
          <CtaButton item={item} />
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
    <div className={`${homeGridClass(layout)} gap-4`}>
      {items.map((it) => <CommerceCard key={it.id} item={it} />)}
    </div>
  );
}

/**
 * Spotlight: بطاقة كبيرة أولى + بطاقات صغيرة بجانبها (تنويع عن الشبكة المتكرّرة).
 * إن كان عنصراً واحداً فقط → بطاقة مميّزة تملأ العرض.
 */
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

/**
 * Carousel: صفّ أفقي قابل للسحب (scroll-snap) — مثالي للجوال، صور كبيرة بلا ازدحام.
 * لا JS: يعتمد سحب اللمس/الفأرة الأصلي مع محاذاة snap. عرض البطاقة ثابت.
 */
export function CommerceCarousel({ items }: { items: CommerceCardItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => (
        <div key={it.id} className="w-[68%] shrink-0 snap-start sm:w-[300px]">
          <CommerceCard item={it} />
        </div>
      ))}
    </div>
  );
}
