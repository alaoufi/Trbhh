import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { formatSar } from '@/lib/commerce/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إيصالات السلع واستحقاقات الموردين', robots: { index: false, follow: false } };
type Receipt = { id: bigint; order_id: bigint; provider: string; provider_ref: string; amount_minor: number; currency: string; recorded_at: Date };
type Accrual = { id: bigint; order_id: bigint; product_id: bigint; supplier_id: bigint; supplier_name: string; amount_minor: number; currency: string; status: string; created_at: Date };
const date = (value: Date) => value.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', dateStyle: 'short', timeStyle: 'short' });

export default async function Accounts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAction('commerce', 'view');
  const query = await searchParams;
  const raw = query.supplier;
  if (raw !== undefined && raw !== '' && (typeof raw !== 'string' || !/^[1-9]\d{0,14}$/.test(raw))) notFound();
  const supplierId = raw ? BigInt(raw as string) : null;
  const rawPage = query.page;
  if (rawPage !== undefined && (typeof rawPage !== 'string' || !/^[1-9]\d{0,5}$/.test(rawPage) || Number(rawPage) > 100000)) notFound();
  const page = rawPage === undefined ? 1 : Number(rawPage);
  const offset = (page - 1) * 100;
  const pageHref = (next: number) => `/admin/commerce/accounts?page=${next}${supplierId === null ? '' : `&supplier=${supplierId}`}`;
  try { await assertCommerceSchemaReady(prisma); } catch { return <p role="alert" className="card-3d rounded-xl p-5">مخطط الحسابات غير جاهز؛ يلزم استكمال الجداول والفهارس قبل عرض السجل.</p>; }
  const [receipts, accruals] = await Promise.all([
    prisma.$queryRaw<Receipt[]>`SELECT r.id,r.order_id,r.provider,r.provider_ref,r.amount_minor,r.currency,r.recorded_at FROM commerce_receipts r WHERE (${supplierId} IS NULL OR EXISTS (SELECT 1 FROM commerce_order_suppliers s WHERE s.order_id=r.order_id AND s.supplier_id=${supplierId})) ORDER BY r.id DESC LIMIT 100 OFFSET ${offset}`,
    prisma.$queryRaw<Accrual[]>`SELECT a.id,a.order_id,a.product_id,a.supplier_id,s.supplier_name,a.amount_minor,a.currency,a.status,a.created_at FROM commerce_supplier_accruals a JOIN commerce_order_suppliers s ON s.order_id=a.order_id AND s.product_id=a.product_id AND s.supplier_id=a.supplier_id WHERE (${supplierId} IS NULL OR a.supplier_id=${supplierId}) ORDER BY a.id DESC LIMIT 100 OFFSET ${offset}`,
  ]);
  return <div className="space-y-4">
    <h1 className="text-xl font-bold text-primary">إيصالات السلع واستحقاقات الموردين</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">سجل تشغيلي داخلي للقراءة فقط، وليس نظام محاسبة نظاميًا متكاملًا. الإيصال يسجل دفعة العميل المتحقق منها بنكيًا؛ استحقاق المورد ينتظر التسوية خارج الموقع ولا يثبت تحويل مستحقاته.</p>
    <nav className="flex gap-4 text-primary underline"><Link href="/admin/commerce">السلع والطلبات</Link><Link href="/admin/suppliers">الموردون</Link></nav>
    <form method="get" action="/admin/commerce/accounts" className="card-3d flex flex-wrap items-end gap-3 rounded-xl p-4">
      <label className="text-sm">تصفية برقم المورد<input name="supplier" inputMode="numeric" pattern="[1-9][0-9]{0,14}" defaultValue={supplierId?.toString() || ''} className="mt-1 block min-h-10 rounded-lg border border-primary/25 px-3" /></label>
      <button className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">تصفية</button><Link href="/admin/commerce/accounts" className="text-primary underline">عرض الكل</Link>
    </form>
    <nav aria-label="صفحات الإيصالات والاستحقاقات" className="flex flex-wrap items-center gap-4 text-primary">
      {page > 1 && <Link className="underline" href={pageHref(page - 1)}>الصفحة السابقة</Link>}
      <span>الصفحة {page} — حتى 100 إيصال و100 استحقاق في الصفحة</span>
      {page < 100000 && (receipts.length === 100 || accruals.length === 100) && <Link className="underline" href={pageHref(page + 1)}>الصفحة التالية</Link>}
    </nav>
    <section className="card-3d overflow-x-auto rounded-xl p-4"><h2 className="font-bold">إيصالات دفعات العملاء — الصفحة {page}</h2>
      <p className="my-2 text-xs">عند اختيار مورد، يظهر إجمالي إيصال الطلب الذي يتضمن سلعه؛ هذا الإجمالي ليس نصيب المورد وقد يشمل سلعًا أخرى ورسوم توصيل.</p>
      <table className="w-full text-right text-sm"><thead><tr><th>الإيصال</th><th>الطلب</th><th>المزود والمرجع</th><th>دفعة العميل</th><th>وقت التسجيل</th></tr></thead>
        <tbody>{receipts.map(r => <tr key={r.id.toString()} className="border-t"><td className="py-2">{r.id.toString()}</td><td><Link className="text-primary underline" href={`/admin/commerce/orders/${r.order_id}`}>#{r.order_id.toString()}</Link></td><td><bdi>{r.provider} · {r.provider_ref}</bdi></td><td>{formatSar(r.amount_minor)} {r.currency}</td><td>{date(r.recorded_at)}</td></tr>)}</tbody>
      </table>{!receipts.length && <p className="py-3 text-sm">لا توجد إيصالات مطابقة.</p>}
    </section>
    <section className="card-3d overflow-x-auto rounded-xl p-4"><h2 className="font-bold">استحقاقات الموردين — الصفحة {page}</h2>
      <table className="mt-3 w-full text-right text-sm"><thead><tr><th>القيد</th><th>الطلب / السلعة</th><th>المورد وقت الطلب</th><th>الاستحقاق</th><th>التسوية الخارجية</th><th>وقت التسجيل</th></tr></thead>
        <tbody>{accruals.map(a => <tr key={a.id.toString()} className="border-t"><td className="py-2">{a.id.toString()}</td><td><Link className="text-primary underline" href={`/admin/commerce/orders/${a.order_id}`}>#{a.order_id.toString()}</Link> / {a.product_id.toString()}</td><td>#{a.supplier_id.toString()} {a.supplier_name}</td><td>{formatSar(a.amount_minor)} {a.currency}</td><td>{a.status === 'offline_pending' ? 'بانتظار التسوية خارج الموقع' : 'حالة تحتاج مراجعة داخلية'}</td><td>{date(a.created_at)}</td></tr>)}</tbody>
      </table>{!accruals.length && <p className="py-3 text-sm">لا توجد استحقاقات مطابقة.</p>}
    </section>
  </div>;
}
