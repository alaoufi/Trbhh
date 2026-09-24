import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { listStorefrontCjProducts } from '@/lib/cj/mapping';
import { CjProductCard } from '@/components/cj/product-card';
import { CartLink } from '@/components/cj/cart-controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تجربة سلع CJ', robots: { index: false, follow: false } };

export default async function CjStorePage() {
  const view = await cjStorefrontView();
  if (!view.isStaff) return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-extrabold text-primary">هذا القسم غير متاح</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-white">العودة للرئيسية</Link></div>;
  const [items, session] = await Promise.all([listStorefrontCjProducts(!view.isStaff, 60), getSession()]);
  return <div className="mx-auto max-w-6xl min-w-0 space-y-5 px-3 py-5 sm:px-5" data-cj-trial="catalog">
    {view.isStaff && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950"><b>تجربة CJ الخاصة</b> — راجع الصور والتفاصيل واجمع السلع في سلة تجريبية. لا دفع أو شراء أو إرسال طلب للمورد.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-primary">سلع مختارة</h1><p className="mt-2 text-sm text-slate-500">{items.length} سلعة في المعاينة</p></div>{view.isStaff && session && <CartLink accountId={session.uid} />}</div>
    {items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map(product => <CjProductCard key={product.id} product={product} />)}</div> : <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">لا توجد سلع مستوردة للمعاينة بعد.</p>}
  </div>;
}
