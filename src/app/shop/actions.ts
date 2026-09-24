'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { takeSecurityAttempt } from '@/lib/auth-security';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { createOrder } from '@/lib/commerce/orders';
import { getMemberAddress } from '@/lib/commerce/address-book';
import { formatAddressLine } from '@/lib/commerce/addresses';
import {readPublicCommerceProducts} from '@/lib/commerce/public-product';

export async function createCommerceOrder(_previous: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const session = await requireUser();
  const config = await getCommerceConfig();
  const gateway = await getCommerceGateway();
  // مفتاح الشراء المركزي (fail-closed): يُمنع إنشاء أي طلب حقيقي إذا كان الشراء معطّلاً،
  // مهما كانت بقية الإعدادات. الرسالة تظهر فقط عند محاولة الشراء (?error=purchasing).
  if (!config.purchasingEnabled) redirect('/shop?error=purchasing');
  if (!config.enabled || !config.paymentsEnabled || !gateway?.ready || config.shippingFeeMinor === null || !config.text.shippingTerms.trim()) redirect('/shop?error=unavailable');
  if (!(await takeSecurityAttempt(`commerce-order:${session.uid}`, 6))) return { error: config.text.rateLimit };
  const product = String(form.get('productId') || '');
  const quantity = String(form.get('quantity') || '');
  const variantKey=String(form.get('variantKey')||'');
  const addressId = String(form.get('addressId') || '');
  const requestKey = String(form.get('requestKey') || '');
  if (!/^[1-9]\d{0,14}$/.test(product) || !/^[1-9]\d{0,3}$/.test(quantity)
    || !/^[1-9]\d{0,19}$/.test(addressId) || !/^[\x21-\x7e]{16,80}$/.test(requestKey) || form.get('terms') !== '1') return { error: config.text.checkoutError };
  const address = await getMemberAddress(BigInt(session.uid), BigInt(addressId)).catch(() => null);
  if (!address) return { error: 'اختر عنوان شحن محفوظًا في حسابك قبل متابعة الطلب.' };
  let orderId: bigint;
  try {
    const publicProduct=(await readPublicCommerceProducts([BigInt(product)])).get(product);
    const selectedVariant=variantKey?publicProduct?.variants.find(item=>item.key===variantKey):undefined;
    if(!publicProduct||!publicProduct.saudiShippingAvailable||publicProduct.requiresVariantSelection&&!selectedVariant||selectedVariant&&Number(quantity)>selectedVariant.stock)throw new Error('checkout_product_changed');
    const order = await createOrder(prisma, {
      memberId: BigInt(session.uid), requestKey,
      items: [{ productId: BigInt(product), quantity: Number(quantity),...(variantKey?{variantKey}:{}) }],
      shipping: { name: address.snapshot.fullName, phone: address.snapshot.phone,
        addressLine: formatAddressLine(address.snapshot), city: address.snapshot.city, postalCode: address.snapshot.postalCode,
        country: 'SA', region: address.snapshot.region, district: address.snapshot.district, street: address.snapshot.street,
        buildingNumber: address.snapshot.buildingNumber, secondaryNumber: address.snapshot.secondaryNumber,
        alternatePhone: address.snapshot.alternatePhone, email: address.snapshot.email, shortAddress: address.snapshot.shortAddress,
        deliveryNotes: address.snapshot.deliveryNotes },
    }, { shippingFeeMinor: config.shippingFeeMinor });
    orderId = order.id;
  } catch { return { error: config.text.checkoutError }; }
  redirect(`/account/orders/${orderId}`);
}
