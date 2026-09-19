'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { takeSecurityAttempt } from '@/lib/auth-security';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { createOrder } from '@/lib/commerce/orders';
import { saudiCommercePhone } from '@/lib/commerce/config';
import { isSaudiShippingArea } from '@/lib/commerce/shipping';

export async function createCommerceOrder(_previous: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const session = await requireUser();
  const config = await getCommerceConfig();
  const gateway = await getCommerceGateway();
  if (!config.enabled || !config.paymentsEnabled || !gateway?.ready || config.shippingFeeMinor === null || !config.text.shippingTerms.trim()) redirect('/shop?error=unavailable');
  if (!(await takeSecurityAttempt(`commerce-order:${session.uid}`, 6))) return { error: config.text.rateLimit };
  const product = String(form.get('productId') || '');
  const quantity = String(form.get('quantity') || '');
  const phone = saudiCommercePhone(String(form.get('phone') || ''));
  const area = String(form.get('area_id') || '');
  const region = String(form.get('city_id') || '');
  if (!/^[1-9]\d{0,14}$/.test(product) || !/^[1-9]\d{0,3}$/.test(quantity) || !phone
    || !/^[1-9]\d{0,9}$/.test(area) || !/^[1-9]\d{0,9}$/.test(region) || form.get('terms') !== '1') return { error: config.text.checkoutError };
  const city = await prisma.areas.findUnique({ where: { id: BigInt(area) } });
  const regionRow = await prisma.cities.findUnique({ where: { id: BigInt(region) } });
  const country = regionRow ? await prisma.countries.findUnique({ where: { id: regionRow.country_id } }) : null;
  if (!city || !isSaudiShippingArea(city, regionRow, country)) return { error: config.text.locationError };
  let orderId: bigint;
  try {
    const order = await createOrder(prisma, {
      memberId: BigInt(session.uid), requestKey: String(form.get('requestKey') || ''),
      items: [{ productId: BigInt(product), quantity: Number(quantity) }],
      shipping: { name: String(form.get('name') || '').trim(), phone: `+${phone}`,
        addressLine: String(form.get('address') || '').trim(), city: city.name,
        postalCode: String(form.get('postalCode') || '').trim(), country: 'SA' },
    }, { shippingFeeMinor: config.shippingFeeMinor });
    orderId = order.id;
  } catch { return { error: config.text.checkoutError }; }
  redirect(`/account/orders/${orderId}`);
}
