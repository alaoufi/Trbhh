import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { formatSar } from '@/lib/commerce/money';
import { saveSupplier, saveSupplierProduct } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الموردون وربط السلع', robots: { index: false, follow: false } };
type Supplier = { id: bigint; name: string; contact_name: string; phone: string; email: string; address: string; registration_number: string; tax_number: string; settlement_terms: string; notes: string; active: number; api_base_url: string; api_credential_ref: string };
type Mapping = { product_id: bigint; supplier_id: bigint; supplier_sku: string; unit_cost_minor: number; title: string; supplier_name: string; supplier_active: number };
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';
const button = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const fields = [
  ['name', 'name', 'اسم المورد', 200], ['contactName', 'contact_name', 'اسم جهة الاتصال', 150],
  ['phone', 'phone', 'جوال المورد', 40], ['email', 'email', 'البريد الإلكتروني', 254],
  ['address', 'address', 'عنوان المورد', 500], ['registrationNumber', 'registration_number', 'رقم السجل التجاري', 100],
  ['taxNumber', 'tax_number', 'الرقم الضريبي', 100], ['settlementTerms', 'settlement_terms', 'شروط التسوية خارج الموقع', 2000],
  ['notes', 'notes', 'ملاحظات داخلية', 2000], ['apiBaseUrl', 'api_base_url', 'عنوان API اختياري (HTTPS)', 500],
  ['apiCredentialRef', 'api_credential_ref', 'مرجع السر البيئي (اسم المتغير فقط)', 100],
] as const;

function SupplierForm({ supplier }: { supplier?: Supplier }) {
  return <form action={saveSupplier} aria-label={supplier ? `تعديل المورد ${supplier.id}` : 'إضافة مورد'} className="grid gap-3 sm:grid-cols-2">
    {supplier && <input type="hidden" name="id" value={supplier.id.toString()} />}
    {fields.map(([name, column, label, max]) => <label key={name} className="text-sm">{label}{name === 'address' || name === 'settlementTerms' || name === 'notes'
      ? <textarea className={input} name={name} rows={3} maxLength={max} defaultValue={supplier?.[column] ?? ''} />
      : <input className={input} name={name} type={name === 'email' ? 'email' : name === 'apiBaseUrl' ? 'url' : 'text'} maxLength={max} required={name === 'name'} defaultValue={supplier?.[column] ?? ''} placeholder={name === 'apiCredentialRef' ? 'TRBHH_SUPPLIER_EXAMPLE' : undefined} />}</label>)}
    <label className="text-sm"><input type="checkbox" name="active" value="1" defaultChecked={supplier?.active === 1} /> ملف المورد نشط</label>
    <label className="text-sm"><input type="checkbox" name="apiEnabled" value="1" disabled /> تفعيل الربط البرمجي — بانتظار اكتمال الموصل والتحقق منه</label>
    <p className="text-xs text-muted-foreground sm:col-span-2">تنشيط الملف يسمح بربط السلع فقط. حفظ عنوان API ومرجع TRBHH_SUPPLIER_* لا يتصل بالمورد. أدخل اسم المتغير البيئي فقط، ولا تدخل مفتاحًا سريًا أو كلمة مرور.</p>
    <button className={button}>حفظ المورد</button>
  </form>;
}
function MappingForm({ mapping, suppliers }: { mapping?: Mapping; suppliers: Supplier[] }) {
  return <form action={saveSupplierProduct} aria-label={mapping ? `ربط السلعة ${mapping.product_id}` : 'ربط سلعة بمورد'} className="grid gap-3 sm:grid-cols-2">
    <label>رقم السلعة المعتمدة<input className={input} name="productId" inputMode="numeric" pattern="[1-9][0-9]{0,14}" required readOnly={!!mapping} defaultValue={mapping?.product_id.toString()} /></label>
    <label>المورد<select className={input} name="supplierId" required defaultValue={mapping?.supplier_id.toString() || ''}>
      <option value="">اختر المورد النشط</option>
      {mapping && !suppliers.some(s => s.id === mapping.supplier_id) && <option value={mapping.supplier_id.toString()} disabled={mapping.supplier_active !== 1}>{mapping.supplier_name} (#{mapping.supplier_id.toString()}) — خارج هذه الصفحة{mapping.supplier_active === 1 ? '' : ' — غير نشط'}</option>}
      {suppliers.map(s => <option key={s.id.toString()} value={s.id.toString()} disabled={s.active !== 1}>{s.name} (#{s.id.toString()}){s.active === 1 ? '' : ' — غير نشط'}</option>)}
    </select></label>
    <label>رمز السلعة لدى المورد<input className={input} name="supplierSku" maxLength={128} defaultValue={mapping?.supplier_sku} /></label>
    <label>تكلفة الوحدة للمورد بالريال<input className={input} name="unitCost" inputMode="decimal" required defaultValue={mapping ? formatSar(mapping.unit_cost_minor) : ''} /></label>
    <button className={button}>حفظ ربط السلعة</button>
  </form>;
}
export default async function Suppliers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAction('suppliers', 'view');
  const query = await searchParams;
  const rawPage = query.page;
  if (rawPage !== undefined && (typeof rawPage !== 'string' || !/^[1-9]\d{0,5}$/.test(rawPage) || Number(rawPage) > 100000)) notFound();
  const page = rawPage === undefined ? 1 : Number(rawPage);
  const offset = (page - 1) * 100;
  try { await assertCommerceSchemaReady(prisma); } catch { return <p role="alert" className="card-3d rounded-xl p-5">مخطط الموردين غير جاهز؛ يلزم استكمال الجداول والفهارس قبل الإدارة.</p>; }
  const [suppliers, mappings] = await Promise.all([
    prisma.$queryRaw<Supplier[]>`SELECT id,name,contact_name,phone,email,address,registration_number,tax_number,settlement_terms,notes,active,api_base_url,api_credential_ref FROM commerce_suppliers ORDER BY id DESC LIMIT 100 OFFSET ${offset}`,
    prisma.$queryRaw<Mapping[]>`SELECT m.product_id,m.supplier_id,m.supplier_sku,m.unit_cost_minor,p.title,s.name AS supplier_name,s.active AS supplier_active FROM commerce_product_suppliers m JOIN commerce_products p ON p.id=m.product_id JOIN commerce_suppliers s ON s.id=m.supplier_id ORDER BY m.product_id DESC LIMIT 100 OFFSET ${offset}`,
  ]);
  return <div className="space-y-4">
    <h1 className="text-xl font-bold text-primary">الموردون وربط السلع</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">الموردون جهات داخلية لتربح. التنفيذ والتسوية خارج الموقع. لا تحويل أموال ولا اتصال API من هذه الصفحة.</p>
    <nav className="flex flex-wrap gap-4 text-primary underline"><Link href="/admin/commerce">السلع والطلبات</Link><Link href="/admin/commerce/accounts">الإيصالات والاستحقاقات</Link></nav>
    {query.saved === '1' && <p role="status" className="text-emerald-700">تم الحفظ.</p>}
    {typeof query.error === 'string' && <p role="alert" className="text-red-700">تعذر الحفظ. راجع الحقول وجاهزية الجداول. ربط السلعة يتطلب سلعة معتمدة وموردًا نشطًا، والربط البرمجي غير متاح بعد.</p>}
    <details className="card-3d rounded-xl p-4"><summary className="mb-3 cursor-pointer font-bold">إضافة مورد</summary><SupplierForm /></details>
    <nav aria-label="صفحات الموردين وروابط السلع" className="flex flex-wrap items-center gap-4 text-primary">
      {page > 1 && <Link className="underline" href={`/admin/suppliers?page=${page - 1}`}>الصفحة السابقة</Link>}
      <span>الصفحة {page} — حتى 100 مورد و100 رابط في الصفحة</span>
      {page < 100000 && (suppliers.length === 100 || mappings.length === 100) && <Link className="underline" href={`/admin/suppliers?page=${page + 1}`}>الصفحة التالية</Link>}
    </nav>
    <section className="space-y-3"><h2 className="font-bold">الموردون — الصفحة {page}</h2>
      {!suppliers.length && <p className="text-sm">لا يوجد موردون في هذه الصفحة.</p>}
      {suppliers.map(s => <details key={s.id.toString()} className="card-3d rounded-xl p-4"><summary className="mb-3 cursor-pointer">#{s.id.toString()} {s.name} — {s.active === 1 ? 'نشط' : 'غير نشط'}</summary><SupplierForm supplier={s} /></details>)}
    </section>
    <section className="card-3d space-y-3 rounded-xl p-4"><h2 className="font-bold">ربط سلعة بمورد</h2><p className="text-sm">التكلفة داخلية؛ لا تغيّر سعر البيع للعميل. التعديلات تخص الطلبات الجديدة ولا تغيّر لقطات الطلبات السابقة. قائمة الاختيار تعرض موردي الصفحة الحالية والمورد المرتبط بالسلعة.</p><MappingForm suppliers={suppliers} /></section>
    <section className="space-y-3"><h2 className="font-bold">روابط السلع — الصفحة {page}</h2>
      {!mappings.length && <p className="text-sm">لا توجد روابط سلع في هذه الصفحة.</p>}
      {mappings.map(m => <details key={m.product_id.toString()} className="card-3d rounded-xl p-4"><summary className="mb-3 cursor-pointer">#{m.product_id.toString()} {m.title} · {m.supplier_name} · {formatSar(m.unit_cost_minor)} ر.س</summary><MappingForm mapping={m} suppliers={suppliers} /></details>)}
    </section>
  </div>;
}
