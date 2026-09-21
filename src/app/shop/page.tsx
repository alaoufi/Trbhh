import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { hasAction } from '@/lib/roles';
import { PLACEHOLDER } from '@/lib/media';
import { primaryImages } from '@/lib/account';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { CommerceHome, type CommerceHomeSection, type CommerceBanner, type CommerceCategory } from '@/components/commerce/commerce-home';
import { firstImageUrl, type CommerceCardItem } from '@/components/commerce/catalog';
import type { HeroSlide } from '@/components/commerce/commerce-hero';

export const dynamic = 'force-dynamic';

// نفس منطق backend المعتمد (الإعداد/المخطط/الاستعلام/بوّابة الدفع) لم يتغيّر — التغيير في العرض فقط.
type Row = { id: bigint; title: string; price_minor: number; stock_available: number; images: unknown; description: string | null; featured: number | null };

/**
 * حالة المعاينة الإدارية عند طلب ?preview=1 (فحص منطقي لا يوقف الزائر):
 *   off        — لم يُطلب preview.
 *   no-session — طُلب preview لكن لا توجد جلسة دخول.
 *   no-perm    — مسجّل دخول لكن بلا صلاحية commerce:view.
 *   ok         — مشرف مخوّل → تُعرض المعاينة.
 */
async function commercePreviewState(wants: boolean): Promise<'off' | 'no-session' | 'no-perm' | 'ok'> {
  if (!wants) return 'off';
  const session = await getSession().catch(() => null);
  if (!session) return 'no-session';
  const ok = await hasAction(session.uid, 'commerce', 'view').catch(() => false);
  return ok ? 'ok' : 'no-perm';
}

/**
 * بطاقات توضيحية من أحدث إعلانات الموقع الحيّة — للمعاينة الإدارية فقط عند خلوّ
 * الكتالوج، لتوضيح شكل التصميم ببيانات حقيقية. قراءة فقط: لا استيراد ولا كتابة،
 * والرابط يفتح صفحة الإعلان، والشراء معطّل.
 */
async function buildDemoAdCards(): Promise<CommerceCardItem[]> {
  // نفس فلتر «الإعلان الظاهر» المستخدم في الموقع (sitemap): منشور، فعّال، وغير
  // مقصورٍ على المتجر (أو ضمن مهلة تربح). بلا شرط سعر — كثير من الإعلانات بلا سعر.
  const ads = await prisma.ads.findMany({
    where: { status: 1, state: 'active', OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] },
    orderBy: { id: 'desc' },
    select: { id: true, title: true, price: true, old_price: true, adsSpecial: true },
    take: 12,
  }).catch(() => []);
  if (ads.length === 0) return [];
  // ترجمة الصور بشكل صحيح: photos.photo_path = معرّف رفع → uploads.file_name → /media
  // (نفس دالة الموقع primaryImages، لا يصحّ استخدام photo_path كمسارٍ مباشر).
  const imgMap = await primaryImages(ads.map((a) => a.id)).catch(() => new Map<number, string>());
  const cards: CommerceCardItem[] = ads.map((a) => {
    const url = imgMap.get(Number(a.id));
    return {
      id: `ad-${a.id}`,
      title: a.title,
      priceMinor: Math.round(a.price * 100),
      compareAtMinor: a.old_price && a.old_price > a.price ? Math.round(a.old_price * 100) : null,
      stock: 1,
      image: url && url !== PLACEHOLDER ? url : null,
      featured: a.adsSpecial === 'checked',
      href: `/ads/${a.id}`,
      buyable: false,
      viewLabel: 'عرض الإعلان',
    } satisfies CommerceCardItem;
  });
  return cards;
}

export default async function ApprovedShop({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [config, sp] = await Promise.all([getCommerceConfig(), searchParams]);
  // وضع المعاينة: المشرف يرى الكتالوج الحيّ عبر ?preview=1 حتى لو كان المتجر مغلقاً للعامة.
  const previewState = await commercePreviewState(sp?.preview === '1');
  const preview = previewState === 'ok';
  if (!config.enabled && !preview) {
    // رسالة تشخيصية واضحة بدل شاشة «غير متاح» العامة عند محاولة معاينة إدارية.
    const msg = previewState === 'no-session'
      ? 'معاينة إدارية: لم يتم التعرّف على جلسة دخول. سجّل الدخول بحسابك الإداري على trbhh.sa (في نفس المتصفّح)، ثم أعد فتح /shop?preview=1 من هذا الجهاز.'
      : previewState === 'no-perm'
        ? 'معاينة إدارية: حسابك مسجّل الدخول لكنه لا يملك صلاحية «عرض التجارة» (commerce:view). ادخل بحساب المدير العام، أو امنح حسابك هذه الصلاحية من لوحة الإدارة، ثم أعد المحاولة.'
        : config.text.unavailable;
    return <div className="card-3d rounded-xl p-6 text-sm font-bold leading-7 text-[#16294a]">{msg}</div>;
  }
  await assertCommerceSchemaReady(prisma);
  const [products, gateway] = await Promise.all([
    prisma.$queryRaw<Row[]>`SELECT cp.id,cp.title,cp.price_minor,cp.stock_available,sp.images,sp.description,sp.featured FROM commerce_products cp LEFT JOIN supplier_products sp ON sp.commerce_product_id=cp.id LEFT JOIN supplier_connections sc ON sc.id=sp.connection_id LEFT JOIN supplier_integration_profiles sip ON sip.supplier_id=sp.supplier_id LEFT JOIN commerce_suppliers s ON s.id=sp.supplier_id WHERE cp.approved=1 AND cp.visible=1 AND cp.enabled=1 AND cp.currency='SAR' AND (sp.id IS NULL OR (sp.active=1 AND sp.visible=1 AND s.active=1 AND sip.maintenance=0 AND sc.status='connected')) ORDER BY COALESCE(sp.featured,0) DESC,cp.id DESC LIMIT 100`,
    getCommerceGateway(),
  ]);
  const canCheckout = config.paymentsEnabled && gateway?.ready && config.shippingFeeMinor !== null && !!config.text.shippingTerms;

  const shortInfo = (d: string | null): string | null => {
    const t = (d ?? '').replace(/\s+/g, ' ').trim();
    return t ? (t.length > 60 ? `${t.slice(0, 57)}…` : t) : null;
  };

  const toCard = (p: Row): CommerceCardItem => ({
    id: p.id.toString(),
    title: p.title,
    priceMinor: p.price_minor,
    stock: p.stock_available,
    image: firstImageUrl(p.images),
    featured: (p.featured ?? 0) > 0,
    info: shortInfo(p.description),
    href: `/shop/${p.id}`,
    buyable: canCheckout,
    buyLabel: config.text.buy,
  });

  const cards = products.map(toCard);

  // معاينة توضيحية فقط: عند خلوّ الكتالوج من سلع معتمدة وكان المتصفِّح مشرفاً في وضع
  // preview، نعرض أحدث إعلانات الموقع الحيّة داخل قالب المتجر «لتوضيح شكل التصميم فقط».
  // لا يُكتب أو يُستورد شيء، ولا يظهر هذا للعامة إطلاقاً، والشراء يبقى معطّلاً.
  const usingDemoAds = preview && cards.length === 0;
  const demoCards = usingDemoAds ? await buildDemoAdCards() : [];
  const sourceCards = usingDemoAds ? demoCards : cards;

  const featured = sourceCards.filter((c) => c.featured);
  const rest = sourceCards.filter((c) => !c.featured);
  const heroCards = featured.length ? featured : sourceCards;

  const hero: HeroSlide[] = heroCards.slice(0, 5).map((c) => ({
    id: c.id, title: c.title, subtitle: c.info ?? undefined, image: c.image, href: c.href, cta: usingDemoAds ? 'عرض الإعلان' : config.text.buy,
  }));

  // شبكة نظيفة كما في التصميم المرجعي: قسم واحد «عروض مميّزة» في المعاينة التوضيحية،
  // وللسلع المعتمدة: مميّزة (Spotlight) + الباقي (شبكة).
  const allProducts = rest.length ? rest : sourceCards;
  // فصل بصري بين «متجر تربح» (شراء مباشر) و«إعلانات تربح» (تواصل خارجي).
  // ملاحظة: عبارة «الاتفاق خارج الموقع» تُعرض فقط داخل تفاصيل الإعلان (بلون مميّز)،
  // لا هنا — تفادياً لالتباسها بسلع الموردين في نفس الصفحة.
  const demoSection: CommerceHomeSection = { id: 'ads', title: 'أحدث إعلانات تربح', kind: 'products', items: sourceCards, display: 'grid', accent: 'orange', subtitle: `${sourceCards.length} إعلان` };
  const realSections: CommerceHomeSection[] = [
    { id: 'featured', title: 'متجر تربح — عروض مميّزة', kind: 'products', items: featured, display: 'spotlight', accent: 'orange', subtitle: 'شراء مباشر' },
    { id: 'all', title: 'متجر تربح — كل المنتجات', kind: 'products', items: allProducts, display: 'grid', accent: 'navy', subtitle: `${allProducts.length} منتج` },
  ];
  const sections = usingDemoAds ? [demoSection] : realSections.filter((s) => s.items.length > 0);

  // «تصفّح حسب الفئة»: فئات تربط بالبحث الحالي (لا نظام أقسام — الأقسام مُزالة من المشروع).
  // نصوص مبدئية للعرض؛ تنتظر تعريف الفئات الحقيقية من الإدارة.
  const categories: CommerceCategory[] = usingDemoAds
    ? ['سيارات', 'عقارات', 'أجهزة وجوّالات', 'أثاث ومنزل', 'معدّات', 'خدمات', 'مواشي', 'أخرى'].map((name) => ({ name, href: `/search?q=${encodeURIComponent(name)}` }))
    : [];

  // في وضع المعاينة (إعلانات أعضاء غير معتمدة) لا يصحّ ادّعاء «المعتمدة» في العنوان/البانر.
  const pageTitle = usingDemoAds ? 'إعلانات تربح' : config.text.title;
  const pageDesc = usingDemoAds
    ? 'أحدث إعلانات الأعضاء المنشورة على تربح.'
    : config.text.description;

  // بانرات سفلية (فاتح + كحلي) بدعوة إجراء — نصوصها من الإعداد قدر الإمكان.
  const banners: CommerceBanner[] = [
    { title: pageTitle, subtitle: pageDesc, cta: usingDemoAds ? 'تصفّح الإعلانات' : config.text.buy, href: usingDemoAds ? '/search' : undefined, tone: 'light' },
    { title: 'معدّات وخدمات متنوّعة', subtitle: 'تصفّح أحدث ما نُشر على تربح في كل المناطق.', cta: 'تصفّح الآن', href: '/search', tone: 'navy' },
  ];

  return (
    <div className="space-y-5">
      {/* رسالة تعطيل الشراء — تظهر فقط عند محاولة شراء (?error=purchasing)، لا على الموقع كله. */}
      {sp?.error === 'purchasing' && (
        <p className="rounded-xl border-2 border-[#ff6a1a]/45 bg-[#ff6a1a]/10 p-3 text-center text-sm font-extrabold text-[#c2410c]">{config.text.purchasingDisabled}</p>
      )}
      <div>
        <h1 className="text-2xl font-extrabold text-[#16294a] sm:text-3xl">{pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pageDesc}</p>
      </div>
      {!canCheckout && !usingDemoAds && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{config.text.unavailable}</p>}
      {sourceCards.length === 0
        ? <p className="rounded-xl border border-[#16294a]/15 bg-[#16294a]/5 p-6 text-center text-sm font-bold text-[#16294a]/70">{preview ? 'لا توجد إعلانات حيّة مطابقة لعرضها كبيانات توضيحية.' : 'لا توجد منتجات معتمدة للعرض حالياً.'}</p>
        : <CommerceHome hero={hero} sections={sections} banners={banners} categories={categories} />}
    </div>
  );
}
