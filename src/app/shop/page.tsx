import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { formatSar } from '@/lib/commerce/money';
import { getCommerceGateway } from '@/lib/commerce/runtime';

export const dynamic = 'force-dynamic';
export default async function ApprovedShop() {
  const config = await getCommerceConfig();
  if (!config.enabled) return <div className="card-3d rounded-xl p-6">{config.text.unavailable}</div>;
  await assertCommerceSchemaReady(prisma);
  const [products, gateway] = await Promise.all([
    prisma.$queryRaw<{ id: bigint; title: string; price_minor: number; stock_available: number }[]>`SELECT id,title,price_minor,stock_available FROM commerce_products WHERE approved=1 AND visible=1 AND enabled=1 AND currency='SAR' ORDER BY id DESC LIMIT 100`,
    getCommerceGateway(),
  ]);
  const canCheckout = config.paymentsEnabled && gateway?.ready && config.shippingFeeMinor !== null && !!config.text.shippingTerms;
  return <div className="space-y-4">
    <h1 className="text-2xl font-extrabold text-primary">{config.text.title}</h1>
    <p className="text-sm text-muted-foreground">{config.text.description}</p>
    {!canCheckout && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{config.text.unavailable}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.map(p => <article key={p.id.toString()} className="card-3d space-y-3 rounded-xl p-4">
      <h2 className="font-bold text-primary">{p.title}</h2><p>{formatSar(p.price_minor)} ر.س</p>
      {canCheckout && p.stock_available > 0 && <Link href={`/shop/${p.id}`} className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">{config.text.buy}</Link>}
    </article>)}</div>
  </div>;
}
