import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { formatSar } from '@/lib/commerce/money';
import { getCities, getAreas, getCountries } from '@/lib/data';
import { CommerceCheckoutForm } from '@/components/commerce-checkout-form';

export const dynamic = 'force-dynamic';
export default async function ProductCheckout({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const config = await getCommerceConfig();
  const gateway = await getCommerceGateway();
  if (!config.enabled || !config.paymentsEnabled || !gateway?.ready || config.shippingFeeMinor === null || !config.text.shippingTerms.trim()) {
    return <div className="card-3d rounded-xl p-5">{config.text.unavailable}</div>;
  }
  const { id } = await params;
  if (!/^[1-9]\d{0,14}$/.test(id)) notFound();
  await assertCommerceSchemaReady(prisma);
  const [product] = await prisma.$queryRaw<{ id: bigint; title: string; price_minor: number; stock_available: number }[]>`SELECT id,title,price_minor,stock_available FROM commerce_products WHERE id=${BigInt(id)} AND approved=1 AND enabled=1 AND visible=1 AND currency='SAR'`;
  if (!product || product.stock_available <= 0) notFound();
  const [countries, cities, areas] = await Promise.all([getCountries(), getCities(), getAreas()]);
  const saudi = countries.find(c => /سعود/.test(c.name));
  return <section className="card-3d mx-auto max-w-2xl space-y-3 rounded-xl p-5">
    <h1 className="text-xl font-bold text-primary">{product.title}</h1>
    <p>{formatSar(product.price_minor)} ر.س للقطعة · رسوم التوصيل: {formatSar(config.shippingFeeMinor)} ر.س للطلب</p>
    <p className="text-sm">{config.text.shippingTerms}</p>
    <CommerceCheckoutForm id={id} requestKey={randomUUID()} memberName={session.name} maximum={Math.min(9999, product.stock_available)}
      regions={cities.filter(c => c.countryId === saudi?.id)} areas={areas} submitLabel={config.text.buy} />
  </section>;
}
