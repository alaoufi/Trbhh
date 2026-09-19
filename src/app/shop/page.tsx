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
    prisma.$queryRaw<{ id: bigint; title: string; price_minor: number; stock_available: number; images:unknown; description:string|null; featured:number|null }[]>`SELECT cp.id,cp.title,cp.price_minor,cp.stock_available,sp.images,sp.description,sp.featured FROM commerce_products cp LEFT JOIN supplier_products sp ON sp.commerce_product_id=cp.id LEFT JOIN supplier_connections sc ON sc.id=sp.connection_id LEFT JOIN supplier_integration_profiles sip ON sip.supplier_id=sp.supplier_id LEFT JOIN commerce_suppliers s ON s.id=sp.supplier_id WHERE cp.approved=1 AND cp.visible=1 AND cp.enabled=1 AND cp.currency='SAR' AND (sp.id IS NULL OR (sp.active=1 AND sp.visible=1 AND s.active=1 AND sip.maintenance=0 AND sc.status='connected')) ORDER BY COALESCE(sp.featured,0) DESC,cp.id DESC LIMIT 100`,
    getCommerceGateway(),
  ]);
  const canCheckout = config.paymentsEnabled && gateway?.ready && config.shippingFeeMinor !== null && !!config.text.shippingTerms;
  return <div className="space-y-4">
    <h1 className="text-2xl font-extrabold text-primary">{config.text.title}</h1>
    <p className="text-sm text-muted-foreground">{config.text.description}</p>
    {!canCheckout && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{config.text.unavailable}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.map(p => <article key={p.id.toString()} className="card-3d space-y-3 rounded-xl p-4">
      <SupplierImage images={p.images} title={p.title}/>
      <h2 className="font-bold text-primary">{p.title}</h2>{p.description&&<p className="line-clamp-3 text-sm">{p.description}</p>}<p>{formatSar(p.price_minor)} ر.س</p>
      {canCheckout && p.stock_available > 0 && <Link href={`/shop/${p.id}`} className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">{config.text.buy}</Link>}
    </article>)}</div>
  </div>;
}
function SupplierImage({images,title}:{images:unknown;title:string}) {
 let values:unknown;try{values=typeof images==='string'?JSON.parse(images):images;}catch{return null;}
 const url=Array.isArray(values)&&typeof values[0]==='string'?values[0]:'';
 if(!url.startsWith('https://'))return null;
 // Provider images are loaded by the browser, never proxied through our server.
 // eslint-disable-next-line @next/next/no-img-element
 return <img src={url} alt={title} loading="lazy" referrerPolicy="no-referrer" className="h-48 w-full rounded-lg object-contain"/>;
}
