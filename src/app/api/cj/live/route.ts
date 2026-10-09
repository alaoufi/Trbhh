import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { getProduct, getInventoryByPid } from '@/lib/cj/client';
import { verifyCjVariantForSaudi } from '@/lib/cj/availability';
import { cjSyncSettings } from '@/lib/cj/sync';
import { defaultMarginBps } from '@/lib/cj/pricing';

/**
 * الأرقام الحقيقية الحيّة لبطاقة سلعة واحدة، تُجلب لحظياً عند تحميل الصفحة (بلا تخزين مسبق).
 * السعر/الشحن/المخزون/الإجمالي من CJ مباشرة عبر verifyCjVariantForSaudi على المتغيّر الأعلى
 * مخزوناً. للموظّفين فقط (products:view). قراءة فقط — لا طلب ولا دفع. طلبات CJ منظَّمة
 * داخلياً (طلب/ثانية) فتُعرض البطاقات تدريجياً. الإجمالي = سعر البيع + أرخص شحن = سعر الشراء الفعلي.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  if (!(await hasAccess(session.uid, 'products', 'view').catch(() => false))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });

  const pid = new URL(request.url).searchParams.get('pid')?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(pid)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers });

  const zipRaw = new URL(request.url).searchParams.get('zip')?.trim() ?? '';
  const zip = /^\d{5}$/.test(zipRaw) ? zipRaw : undefined;

  // طلبان فقط هنا (getProduct + getInventoryByPid) ثم شحن واحد داخل verify ≈ ٣ طلبات/بطاقة
  // بدل ٩. getInventoryByPid يجلب مخزون كل المتغيّرات دفعةً واحدة، فنختار المتغيّر الأعلى
  // مخزوناً في مستودع CJ فعلياً (لا المصنع) — فلا نفشل بـ out_of_stock على متغيّر غير مباع.
  const [product, pidInventory] = await Promise.all([
    getProduct(pid).catch(() => null),
    getInventoryByPid(pid).catch(() => null),
  ]);
  if (!product?.ok) return NextResponse.json({ status: 'unavailable' }, { headers });

  const [settings, marginBps] = await Promise.all([
    cjSyncSettings().catch(() => ({ usdToSarX100: 375 } as { usdToSarX100: number })),
    defaultMarginBps().catch(() => 3000),
  ]);

  const eligible = product.data.variants.filter((v) => typeof v.variantSellPrice === 'number' && v.variantSellPrice > 0 && /^[A-Za-z0-9_-]{1,64}$/.test(v.vid));
  if (!eligible.length) return NextResponse.json({ status: 'unavailable' }, { headers });

  // مخزون مستودع CJ المُباع فعلاً لكل vid (cjInventoryQuantity) من الطلب الواحد.
  const cjStockByVid = new Map<string, number>();
  if (pidInventory?.ok) for (const row of pidInventory.data) {
    const q = typeof row.cjInventoryQuantity === 'number' && row.cjInventoryQuantity > 0 ? row.cjInventoryQuantity : 0;
    if (row.vid && q) cjStockByVid.set(row.vid, (cjStockByVid.get(row.vid) ?? 0) + q);
  }
  // المتغيّر الأعلى مخزوناً في CJ؛ فإن لم يُعرف مخزون لأيّها نعود لأرخص متغيّر.
  const variant = [...eligible].sort((a, b) => (cjStockByVid.get(b.vid) ?? 0) - (cjStockByVid.get(a.vid) ?? 0) || (a.variantSellPrice ?? 0) - (b.variantSellPrice ?? 0))[0];

  const check = await verifyCjVariantForSaudi(
    pid, variant, 1,
    {
      getVariants: async () => ({ ok: true, data: product.data.variants }),
      ...(pidInventory?.ok ? { getInventoryByVid: async (vid: string) => ({ ok: true as const, data: pidInventory.data.filter((r) => r.vid === vid) }) } : {}),
    },
    settings.usdToSarX100, { marginBps }, zip,
  ).catch(() => null);

  if (!check || check.status !== 'available') return NextResponse.json({ status: check?.status ?? 'unavailable' }, { headers });

  const cheapest = [...check.shippingOptions].sort((a, b) => (a.priceMinor + a.additionalMinor) - (b.priceMinor + b.additionalMinor))[0];
  const shipMinor = cheapest ? cheapest.priceMinor + cheapest.additionalMinor : 0;
  return NextResponse.json({
    status: 'available',
    priceMinor: check.salePriceMinor,
    shipMinor,
    stock: check.stockQuantity,
    totalMinor: check.salePriceMinor + shipMinor,
    deliveryDays: cheapest?.deliveryDays ?? null,
  }, { headers });
}
