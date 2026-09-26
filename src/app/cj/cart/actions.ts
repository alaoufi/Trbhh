'use server';
import { redirect } from 'next/navigation';
import { requireAccess } from '@/lib/access-control/guards';
import { quoteCjTrialCart } from '@/lib/cj/trial-quote';
import { createOrder } from '@/lib/cj/orders/store';

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

  const quote = await quoteCjTrialCart(items).catch(() => null);
  if (!quote || quote.rejected.length || !quote.lines.length || !(quote.totalMinor > 0)) {
    redirect('/cj/cart?order=recheck');
  }

  const s = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max);
  const shipName = s(form.get('shipName'), 160);
  const shipPhone = s(form.get('shipPhone'), 40);
  const shipCity = s(form.get('shipCity'), 120);
  const shipAddress1 = s(form.get('shipAddress1'), 400);
  if (!shipName || !shipPhone || !shipCity || !shipAddress1) redirect('/cj/cart?order=address');

  const lines = quote!.lines;
  const itemsTotalMinor = lines.reduce((sum, l) => sum + l.unitMinor * (l.qty || 1), 0);
  const taxTotalMinor = lines.reduce((sum, l) => sum + (l.vatMinor || 0), 0);
  const grandTotalMinor = quote!.totalMinor;
  const shippingTotalMinor = Math.max(0, grandTotalMinor - itemsTotalMinor - taxTotalMinor);
  const productName = lines.length > 1 ? `طلب (${lines.length} أصناف)` : lines[0].title;
  const internalRef = `cjt-${session.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    ship: { name: shipName, phone: shipPhone, country: 'SA', city: shipCity, region: s(form.get('shipRegion'), 120), address1: shipAddress1, address2: s(form.get('shipAddress2'), 400) },
  }, session.uid);

  redirect(`/admin/suppliers/cj/orders/${id}?created=1`);
}
