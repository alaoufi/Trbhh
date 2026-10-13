'use server';
import {createHash} from 'node:crypto';
import { redirect } from 'next/navigation';
import { requireAccess } from '@/lib/access-control/guards';
import { quoteCjTrialCart } from '@/lib/cj/trial-quote';
import { createOrder } from '@/lib/cj/orders/store';
import {getCjDestinationAddress} from '@/lib/cj/destination';

/**
 * جسر «إتمام الطلب» (المرحلة 1 — بلا أموال ولا شراء حقيقي):
 * يعيد التحقّق من السلّة على الخادم (سعر/مخزون/شحن/ضريبة حيّة) عبر quoteCjTrialCart،
 * فإن نجح كل السطور يُنشئ طلباً داخلياً بحالة «بانتظار الدفع» (الحالة الافتراضية) بلا
 * أي خصم أو إرسال إلى المورد. إرسال الطلب فعلياً للمورد خطوة لاحقة مقفلة بحارسي الشراء.
 * الوصول مقصور على الموظّفين (المتجر خاص حالياً).
 */
export async function placeCjTrialOrder(form: FormData): Promise<void> {
  const session = await requireAccess('products', 'view');
  let items: unknown;
  try { items = JSON.parse(String(form.get('items') || '[]')); } catch { redirect('/cj/cart?order=invalid'); }

  const destination=await getCjDestinationAddress(session.uid).catch(()=>null);
  if(!destination)redirect('/cj/cart?order=address');

  // The quoted postcode and order destination come from the same owned snapshot.
  const shipName = destination.fullName.trim().slice(0,160);
  const shipPhone = destination.phone.trim().slice(0,40);
  const shipCity = destination.city.trim().slice(0,120);
  const shipAddress1 = [destination.district,destination.street,destination.buildingNumber].filter(Boolean).join('، ').slice(0,400);
  const shipRegion=destination.region.trim().slice(0,120);
  const shipAddress2=`الرمز البريدي ${destination.postalCode}`;
  if (!shipName || !shipPhone || !shipCity || !shipAddress1) redirect('/cj/cart?order=address');
  const submitted={shipName,shipPhone,shipCity,shipRegion,shipAddress1,shipAddress2};
  if(Object.entries(submitted).some(([key,value])=>String(form.get(key)??'').trim()!==value))redirect('/cj/cart?order=address');
  const quote=await quoteCjTrialCart(items,{destinationZip:destination.postalCode}).catch(()=>null);
  if(!quote||quote.rejected.length||!quote.lines.length||!(quote.totalMinor>0))redirect('/cj/cart?order=recheck');

  const lines = quote!.lines;
  const itemsTotalMinor = lines.reduce((sum, l) => sum + l.unitMinor * (l.qty || 1), 0);
  const taxTotalMinor = lines.reduce((sum, l) => sum + (l.vatMinor || 0), 0);
  const grandTotalMinor = quote!.totalMinor;
  const shippingTotalMinor = Math.max(0, grandTotalMinor - itemsTotalMinor - taxTotalMinor);
  const productName = lines.length > 1 ? `طلب (${lines.length} أصناف)` : lines[0].title;
  // نفس لقطة السلة والعنوان للمستخدم تعيد الطلب نفسه عبر تفرّد internal_ref.
  const intent = JSON.stringify({uid:session.uid,items,shipName,shipPhone,shipCity,shipAddress1,shipRegion,shipAddress2});
  const internalRef = `cjt-${session.uid}-${createHash('sha256').update(intent).digest('hex').slice(0,40)}`;
  // بنود الإرسال للمورد: المورد يحتاج vid (وهو variantId في السلة) + الكمية، ومسار الشحن.
  const orderLines = lines
    .filter(l => l.variantId)
    .map(l => ({ vid: String(l.variantId), quantity: l.qty || 1, sku: l.variantSku || undefined, logisticName: l.shippingName || undefined }));

  const { id } = await createOrder({
    internalRef,
    userId: session.uid,
    cjProductId: String(lines[0].id),
    productName,
    itemsTotalMinor,
    shippingTotalMinor,
    taxTotalMinor,
    grandTotalMinor,
    currency: 'SAR',
    lines: orderLines,
    ship: { name: shipName, phone: shipPhone, country: 'SA', city: shipCity, region: shipRegion, address1: shipAddress1, address2: shipAddress2,zip:destination.postalCode },
  }, session.uid);

  redirect(`/admin/suppliers/cj/orders/${id}?created=1`);
}
