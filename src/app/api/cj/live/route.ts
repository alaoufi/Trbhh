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

// ذاكرة حيّة قصيرة على الخادم (٥ دقائق) لنتيجة CJ الحقيقية لكل سلعة — ليست تخزيناً مسبقاً
// لقيم تقديرية، بل حفظ لنتيجة حيّة جُلبت فعلاً كي لا يُعاد نداء CJ (طلب/ثانية) لكل مشاهدة أو
// تمرير أو مستخدم. السعر/المخزون/الشحن لا تتغيّر خلال دقائق، فتبقى مطابقة لسعر الشراء.
const LIVE_TTL_MS = 5 * 60 * 1000;
const liveCache = new Map<string, { at: number; payload: unknown }>();

export async function GET(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  if (!(await hasAccess(session.uid, 'products', 'view').catch(() => false))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });

  const pid = new URL(request.url).searchParams.get('pid')?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(pid)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers });

  const zipRaw = new URL(request.url).searchParams.get('zip')?.trim() ?? '';
  const zip = /^\d{5}$/.test(zipRaw) ? zipRaw : undefined;

  const cacheKey = `${pid}|${zip ?? ''}`;
  const cached = liveCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIVE_TTL_MS) return NextResponse.json(cached.payload, { headers });

  const respond = (payload: unknown) => { liveCache.set(cacheKey, { at: Date.now(), payload }); return NextResponse.json(payload, { headers }); };

  // getProduct دائماً (للسعر/المتغيّرات). getInventoryByPid فقط عند تعدّد المتغيّرات (لترتيب
  // الاختيار)؛ فالسلعة ذات متغيّر واحد توفّر هذا الطلب. ثم شحن واحد داخل verify.
  const product = await getProduct(pid).catch(() => null);
  if (!product?.ok) return respond({ status: 'unavailable' });

  const [settings, marginBps] = await Promise.all([
    cjSyncSettings().catch(() => ({ usdToSarX100: 375 } as { usdToSarX100: number })),
    defaultMarginBps().catch(() => 3000),
  ]);

  const eligible = product.data.variants.filter((v) => typeof v.variantSellPrice === 'number' && v.variantSellPrice > 0 && /^[A-Za-z0-9_-]{1,64}$/.test(v.vid));
  if (!eligible.length) return respond({ status: 'unavailable' });

  // المخزون القابل للبيع لكل vid (كمية CJ إن وُجدت وإلا الكلية المُبلَّغة) — للترتيب فقط، ولا
  // نطلبه إلا عند تعدّد المتغيّرات. التحقّق النهائي يبقى على مصدر verify الموثوق (queryByVid).
  const stockByVid = new Map<string, number>();
  if (eligible.length > 1) {
    const pidInventory = await getInventoryByPid(pid).catch(() => null);
    if (pidInventory?.ok) for (const row of pidInventory.data) {
      const q = (typeof row.cjInventoryQuantity === 'number' && row.cjInventoryQuantity > 0 ? row.cjInventoryQuantity : 0) || (typeof row.storageNum === 'number' && row.storageNum > 0 ? row.storageNum : 0);
      if (row.vid && q) stockByVid.set(row.vid, (stockByVid.get(row.vid) ?? 0) + q);
    }
  }
  // المتغيّر الأعلى مخزوناً؛ فإن لم يُعرف مخزون لأيّها نعود لأرخص متغيّر.
  const variant = [...eligible].sort((a, b) => (stockByVid.get(b.vid) ?? 0) - (stockByVid.get(a.vid) ?? 0) || (a.variantSellPrice ?? 0) - (b.variantSellPrice ?? 0))[0];

  const check = await verifyCjVariantForSaudi(
    pid, variant, 1,
    { getVariants: async () => ({ ok: true, data: product.data.variants }) },
    settings.usdToSarX100, { marginBps }, zip,
  ).catch(() => null);

  // لا نُخزّن حالات الفشل/النفاد (قد تكون عابرة بسبب حدّ المعدّل) كي تُعاد المحاولة فوراً.
  if (!check || check.status !== 'available') return NextResponse.json({ status: check?.status ?? 'unavailable' }, { headers });

  const cheapest = [...check.shippingOptions].sort((a, b) => (a.priceMinor + a.additionalMinor) - (b.priceMinor + b.additionalMinor))[0];
  const shipMinor = cheapest ? cheapest.priceMinor + cheapest.additionalMinor : 0;
  return respond({
    status: 'available',
    priceMinor: check.salePriceMinor,
    shipMinor,
    stock: check.stockQuantity,
    totalMinor: check.salePriceMinor + shipMinor,
    deliveryDays: cheapest?.deliveryDays ?? null,
  });
}
