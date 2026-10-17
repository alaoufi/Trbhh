import {automaticCjPricing} from '@/lib/cj/automatic-pricing';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { getProduct, getInventoryByPid } from '@/lib/cj/client';
import { verifyCjVariantForSaudi } from '@/lib/cj/availability';
import {readVerifiedCjPricing} from '@/lib/cj/verified-pricing';
import { createDisplayReadCache,isLiveDisplayPayload } from '@/lib/cj/display-freshness';
import {getCjDestinationZip} from '@/lib/cj/destination';
import {getStorefrontCjProduct} from '@/lib/cj/mapping';

/**
 * الأرقام الحقيقية الحيّة لبطاقة سلعة واحدة، تُتحقق من المصدر وتُعاد نتيجة العرض الناجحة لمدة لا تتجاوز 30 ثانية.
 * السعر/الشحن/المخزون/الإجمالي من CJ مباشرة عبر verifyCjVariantForSaudi على المتغيّر الأعلى
 * مخزوناً. للموظّفين فقط (products:view). قراءة فقط — لا طلب ولا دفع. طلبات CJ منظَّمة
 * داخلياً (طلب/ثانية) فتُعرض البطاقات تدريجياً. الإجمالي = سعر البيع + أرخص شحن = سعر الشراء الفعلي.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

// Display only. Purchase verification never reads these short-lived observations.
const liveCache = createDisplayReadCache<Record<string,unknown>>(30000,Date.now,200,value=>{
  const age=Date.now()-Date.parse(String(value.checkedAt||''));
  return isLiveDisplayPayload(value)&&age>=0&&age<30000;
});

export async function GET(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  if (!(await hasAccess(session.uid, 'products', 'view').catch(() => false))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });

  const pid = new URL(request.url).searchParams.get('pid')?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(pid)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers });

  const zip = await getCjDestinationZip(session.uid).catch(()=>null);
  if(zip===null)return NextResponse.json({status:'unavailable'},{headers});
  if(!zip)return NextResponse.json({status:'destination_required'},{headers});

  const sourceView=new URL(request.url).searchParams.get('view')==='source';
  const idRaw=new URL(request.url).searchParams.get('id');
  const productId=idRaw===null?null:Number(idRaw);
  if(productId!==null&&(!Number.isSafeInteger(productId)||productId<1))return NextResponse.json({error:'invalid'},{status:400,headers});
  const row=productId===null?null:await getStorefrontCjProduct(productId,false).catch(()=>null);
  if(productId!==null&&(!row||row.hidden!==0||row.cj_product_id!==pid))return NextResponse.json({status:'unavailable'},{headers});
  const settings=await readVerifiedCjPricing().catch(()=>null);
  if(!settings)return NextResponse.json({status:'unavailable'},{headers});
  const cacheKey = JSON.stringify([session.uid,pid,zip,productId,sourceView,settings.usdToSarX100,settings.marginBps,row?.margin_bps,row?.other_costs_minor,row?.sale_price_override_minor]);
  const refresh=new URL(request.url).searchParams.get('refresh')==='1';
  const payload=await liveCache.read(cacheKey,async()=>{
  const respond = (value: Record<string,unknown>) => value;

  // عند التحقق الجديد نقرأ السعر والخيارات. مخزون PID عند تعدد الخيارات يختار المتغير
  // ثم يعاد استخدام صفوفه المطابقة فقط بدل طلب مخزون إضافي. الشحن يظل طلبًا فعليًا.
  const product = await getProduct(pid).catch(() => null);
  if (!product?.ok) return respond({ status: 'unavailable' });

  const settings=await readVerifiedCjPricing();
  const marginBps=settings.marginBps;

  const eligible = product.data.variants.filter((v) => typeof v.variantSellPrice === 'number' && v.variantSellPrice > 0 && /^[A-Za-z0-9_-]{1,64}$/.test(v.vid));
  if (!eligible.length) return respond({ status: 'unavailable' });

  // المخزون القابل للبيع لكل vid (كمية CJ إن وُجدت وإلا الكلية المُبلَّغة) — للترتيب فقط، ولا
  // نطلبه إلا عند تعدّد المتغيّرات. تمر الصفوف المطابقة عبر نفس تحقق VID والبلد والكمية داخل verify.
  const stockByVid = new Map<string, number>();
  let pidInventory:Awaited<ReturnType<typeof getInventoryByPid>>|null=null;
  if (eligible.length > 1) {
    pidInventory = await getInventoryByPid(pid).catch(() => null);
    if (pidInventory?.ok) for (const row of pidInventory.data) {
      const q = (typeof row.cjInventoryQuantity === 'number' && row.cjInventoryQuantity > 0 ? row.cjInventoryQuantity : 0) || (typeof row.storageNum === 'number' && row.storageNum > 0 ? row.storageNum : 0);
      if (row.vid && q) stockByVid.set(row.vid, (stockByVid.get(row.vid) ?? 0) + q);
    }
  }
  // المتغيّر الأعلى مخزوناً؛ فإن لم يُعرف مخزون لأيّها نعود لأرخص متغيّر.
  const variant = [...eligible].sort((a, b) => (stockByVid.get(b.vid) ?? 0) - (stockByVid.get(a.vid) ?? 0) || (a.variantSellPrice ?? 0) - (b.variantSellPrice ?? 0))[0];

  const check = await verifyCjVariantForSaudi(
    pid, variant, 1,
    { getVariants: async () => ({ ok: true, data: product.data.variants }),
      ...(pidInventory?.ok&&pidInventory.data.some(r=>r.vid===variant.vid&&r.countryCode)?{getInventoryByVid:async(vid:string)=>({ok:true as const,data:pidInventory?.ok?pidInventory.data.filter(r=>r.vid===vid):[]})}:{}) },
    settings.usdToSarX100, row?automaticCjPricing(settings,row):{ marginBps }, zip,
  ).catch(() => null);

  // لا نُخزّن حالات الفشل/النفاد (قد تكون عابرة بسبب حدّ المعدّل) كي تُعاد المحاولة فوراً.
  if (!check || check.status !== 'available') return { status: check?.status ?? 'unavailable' };

  const cheapest = [...check.shippingOptions].sort((a, b) => (a.priceMinor + a.additionalMinor) - (b.priceMinor + b.additionalMinor))[0];
  const shipMinor = cheapest ? cheapest.priceMinor + cheapest.additionalMinor : 0;
  return respond({
    status: 'available',
    priceMinor: sourceView?check.supplierPriceMinor:check.salePriceMinor,
    shipMinor,
    stock: check.stockQuantity,
    totalMinor: (sourceView?check.supplierPriceMinor:check.salePriceMinor) + shipMinor,
    deliveryDays: cheapest?.deliveryDays ?? null,
    checkedAt: check.checkedAt,
    vid: check.vid,
    quantity: 1,
    destinationZip:zip,
  });
  },refresh).catch(()=>({status:'unavailable'}));
  return NextResponse.json(payload,{headers});
}
