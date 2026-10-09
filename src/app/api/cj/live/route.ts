import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { sampleOneCjProduct } from '@/lib/cj/sample';
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

  const sample = await sampleOneCjProduct(pid).catch(() => null);
  if (!sample?.ok) return NextResponse.json({ status: 'unavailable' }, { headers });

  const [settings, marginBps] = await Promise.all([
    cjSyncSettings().catch(() => ({ usdToSarX100: 375 } as { usdToSarX100: number })),
    defaultMarginBps().catch(() => 3000),
  ]);

  // المتغيّر الأعلى مخزوناً (الأرجح توفّراً) ليظهر الشحن/المخزون الحيّ بدل الفشل على متغيّر نافد.
  const variant = [...sample.data.variants]
    .filter((v) => typeof v.priceUsd === 'number' && v.priceUsd! > 0 && /^[A-Za-z0-9_-]{1,64}$/.test(v.vid))
    .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0];
  if (!variant) return NextResponse.json({ status: 'unavailable' }, { headers });

  const check = await verifyCjVariantForSaudi(
    pid,
    { vid: variant.vid, variantSku: variant.sku, variantName: variant.name, variantKey: null, variantSellPrice: variant.priceUsd, variantImage: null, variantWeight: variant.weight, attributes: {} },
    1, {}, settings.usdToSarX100, { marginBps }, zip,
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
