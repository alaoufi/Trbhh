import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { hasAction } from '@/lib/roles';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { CommerceHome, type CommerceHomeSection, type CommerceBanner } from '@/components/commerce/commerce-home';
import { firstImageUrl, type CommerceCardItem } from '@/components/commerce/catalog';
import type { HeroSlide } from '@/components/commerce/commerce-hero';

export const dynamic = 'force-dynamic';

// نفس منطق backend المعتمد (الإعداد/المخطط/الاستعلام/بوّابة الدفع) لم يتغيّر — التغيير في العرض فقط.
type Row = { id: bigint; title: string; price_minor: number; stock_available: number; images: unknown; description: string | null; featured: number | null };

/** معاينة إدارية فقط: هل المتصفِّح مشرفٌ له صلاحية عرض التجارة؟ (فحص منطقي لا يوقف الزائر). */
async function isCommercePreviewer(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return hasAction(session.uid, 'commerce', 'view').catch(() => false);
}

export default async function ApprovedShop({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [config, sp] = await Promise.all([getCommerceConfig(), searchParams]);
  // وضع المعاينة: المشرف يرى الكتالوج الحيّ عبر ?preview=1 حتى لو كان المتجر مغلقاً للعامة.
  const preview = sp?.preview === '1' && (await isCommercePreviewer());
  if (!config.enabled && !preview) return <div className="card-3d rounded-xl p-6">{config.text.unavailable}</div>;
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
  const featured = cards.filter((c) => c.featured);
  const rest = cards.filter((c) => !c.featured);

  const hero: HeroSlide[] = featured.slice(0, 5).map((c) => ({
    id: c.id, title: c.title, subtitle: c.info ?? undefined, image: c.image, href: c.href, cta: config.text.buy,
  }));

  // تنويع التخطيط: المميّزة كـSpotlight (بطاقة كبيرة + صغيرة)، والبقية شبكة متكيّفة.
  const allProducts = rest.length ? rest : cards;
  const allSections: CommerceHomeSection[] = [
    { id: 'featured', title: 'منتجات مميّزة', kind: 'products', items: featured, display: 'spotlight', accent: 'gold', subtitle: 'اختيار تربح' },
    { id: 'all', title: 'كل المنتجات', kind: 'products', items: allProducts, display: 'grid', accent: 'navy', subtitle: `${allProducts.length} منتج` },
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
      <div>
        <h1 className="text-2xl font-extrabold text-[#16294a] sm:text-3xl">{config.text.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{config.text.description}</p>
      </div>
      {!canCheckout && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{config.text.unavailable}</p>}
      {cards.length === 0
        ? <p className="rounded-xl border border-[#16294a]/15 bg-[#16294a]/5 p-6 text-center text-sm font-bold text-[#16294a]/70">لا توجد منتجات معتمدة للعرض حالياً.</p>
        : <CommerceHome hero={hero} sections={sections} options={{ adEvery: 1 }} banners={banners} />}
    </div>
  );
}
