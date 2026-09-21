import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { hasAction } from '@/lib/roles';
import { mediaUrl } from '@/lib/media';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { CommerceHome, type CommerceHomeSection, type CommerceBanner } from '@/components/commerce/commerce-home';
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
  const ids = ads.map((a) => a.id);
  const photos = await prisma.photos.findMany({
    where: { other_id: { in: ids } }, orderBy: { id: 'asc' }, select: { other_id: true, photo_path: true },
  }).catch(() => [] as { other_id: bigint; photo_path: string }[]);
  const firstPhoto = new Map<string, string>();
  for (const p of photos) { const k = p.other_id.toString(); if (!firstPhoto.has(k)) firstPhoto.set(k, p.photo_path); }
  return ads.map((a) => {
    const path = firstPhoto.get(a.id.toString());
    return {
      id: `ad-${a.id}`,
      title: a.title,
      priceMinor: Math.round(a.price * 100),
      compareAtMinor: a.old_price && a.old_price > a.price ? Math.round(a.old_price * 100) : null,
      stock: 1,
      image: path ? mediaUrl(path) : null,
      featured: a.adsSpecial === 'checked',
      href: `/classified/${a.id}`,
      buyable: false,
      viewLabel: 'عرض الإعلان',
    } satisfies CommerceCardItem;
  });
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
  const heroCards = featured.length ? featured : (usingDemoAds ? sourceCards : []);

  const hero: HeroSlide[] = heroCards.slice(0, 5).map((c) => ({
    id: c.id, title: c.title, subtitle: c.info ?? undefined, image: c.image, href: c.href, cta: usingDemoAds ? 'عرض الإعلان' : config.text.buy,
  }));

  // تنويع التخطيط: المميّزة كـSpotlight (بطاقة كبيرة + صغيرة)، والبقية شبكة متكيّفة.
  const allProducts = rest.length ? rest : sourceCards;
  const unit = usingDemoAds ? 'إعلان' : 'منتج';
  const allSections: CommerceHomeSection[] = [
    { id: 'featured', title: usingDemoAds ? 'إعلانات مميّزة' : 'منتجات مميّزة', kind: 'products', items: featured, display: 'spotlight', accent: 'gold', subtitle: usingDemoAds ? 'الأبرز' : 'اختيار تربح' },
    { id: 'all', title: usingDemoAds ? 'أحدث إعلانات الموقع' : 'كل المنتجات', kind: 'products', items: allProducts, display: 'grid', accent: 'navy', subtitle: `${allProducts.length} ${unit}` },
  ];
  const sections = allSections.filter((s) => s.items.length > 0);

  // بانرات ترويجية حقيقية تُدرَج بين الصفوف (نصوصها من الإعداد، لا نصّ ثابت في الكود).
  const banners: CommerceBanner[] = [
    { title: config.text.title, subtitle: config.text.description, cta: config.text.buy, tone: 'gold' },
    { title: 'منتجات موثوقة من موردين معتمدين', subtitle: 'التوريد والدفع يُداران خلف الكواليس بأمان.', tone: 'navy' },
  ];

  return (
    <div className="space-y-5">
      {preview && !config.enabled && (
        <p className="rounded-xl border border-[#f0b429]/60 bg-[#f0b429]/10 p-3 text-sm font-bold text-[#16294a]">
          معاينة إدارية — المتجر غير مُفعّل للعامة بعد. هذه الصفحة تظهر لك أنت فقط (كمشرف)؛ الأزرار للعرض فقط والدفع غير مُفعّل.
        </p>
      )}
      {usingDemoAds && (
        <p className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm font-bold leading-6 text-sky-900">
          بيانات توضيحية: لا توجد سلع معتمدة بعد، لذا عُرِضت أحدث <b>إعلانات الموقع الحيّة</b> داخل قالب المتجر لتوضيح شكل التصميم فقط — هذه إعلانات عادية (تواصل واتفاق خارج الموقع)، وليست سلعاً معتمدة للبيع المباشر. أزرار «عرض الإعلان» تفتح صفحة الإعلان.
        </p>
      )}
      <div>
        <h1 className="text-2xl font-extrabold text-[#16294a] sm:text-3xl">{config.text.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{config.text.description}</p>
      </div>
      {!canCheckout && !usingDemoAds && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{config.text.unavailable}</p>}
      {sourceCards.length === 0
        ? <p className="rounded-xl border border-[#16294a]/15 bg-[#16294a]/5 p-6 text-center text-sm font-bold text-[#16294a]/70">{preview ? 'لا توجد إعلانات حيّة مطابقة لعرضها كبيانات توضيحية.' : 'لا توجد منتجات معتمدة للعرض حالياً.'}</p>
        : <CommerceHome hero={hero} sections={sections} options={{ adEvery: 1 }} banners={banners} />}
    </div>
  );
}
