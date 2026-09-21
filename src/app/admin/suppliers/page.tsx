import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasAction, requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { formatSar } from '@/lib/commerce/money';
import { deleteSupplier, deleteSupplierProducts, saveSupplier, saveSupplierProduct } from './actions';
import {approveSupplierData,reopenSupplierData} from './data-actions';
import {SupplierDataInvitePanel} from '@/components/supplier-data-invite-panel';
import {decryptInvitationDraft} from '@/lib/suppliers/data-invitations';
import type {OnboardingValues} from '@/lib/suppliers/onboarding-fields';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الموردون وربط السلع', robots: { index: false, follow: false } };
type Supplier = { id: bigint; name: string; contact_name: string; phone: string; email: string; address: string; registration_number: string; tax_number: string; settlement_terms: string; notes: string; active: number; api_base_url: string; api_credential_ref: string; product_count: bigint; history_count: bigint; store_url:string|null;invite_status:string|null;invite_generation:number|null;invite_draft:string|null;invite_expires:Date|null;connection_count:bigint };
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
function MappingForm({ mapping, suppliers }: { mapping: Mapping; suppliers: Supplier[] }) {
  return <form action={saveSupplierProduct} aria-label={`تعديل ربط ${mapping.title}`} className="grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="productId" value={mapping.product_id.toString()} />
    <p className="font-bold sm:col-span-2">{mapping.title}</p>
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
function SupplierDeletion({supplier}:{supplier:Supplier}) {
  const products=Number(supplier.product_count),history=Number(supplier.history_count);
  return <details className="mt-5 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-red-950"><summary className="cursor-pointer font-bold">حذف المورد والمنتجات</summary>
    <p className="mt-3 text-sm leading-7">هذه عملية نهائية من خطوتين. المنتجات المرتبطة: <b>{products}</b>، سجلات الطلبات المحمية: <b>{history}</b>.</p>
    {history>0&&<p role="alert" className="mt-3 rounded-lg bg-white p-3 text-sm font-bold">لا يمكن حذف هذا المورد لأن لديه سجل طلبات أو استحقاقات يجب حفظه.</p>}
    {products>0&&history===0&&<form action={deleteSupplierProducts} className="mt-4 grid gap-3 rounded-xl border border-red-200 bg-white p-4">
      <input type="hidden" name="supplierId" value={supplier.id.toString()}/><input type="hidden" name="supplierName" value={supplier.name}/><p className="text-sm font-bold">الخطوة 1: حذف كل منتجات المورد من كتالوج تربح أولًا.</p>
      <label className="text-sm">اكتب اسم المورد للتأكيد<input className={input} name="confirmName" autoComplete="off" required /></label>
      <label className="text-sm">اكتب العبارة: <b>حذف منتجات المورد</b><input className={input} name="confirmPhrase" autoComplete="off" required /></label>
      <label className="text-sm"><input type="checkbox" name="acknowledge" value="1" required/> أفهم أن المنتجات المحذوفة لا يمكن استعادتها من هذه الشاشة.</label>
      <button className="w-fit rounded-lg bg-red-700 px-4 py-2 font-bold text-white">حذف منتجات المورد</button>
    </form>}
    {products===0&&history===0&&<form action={deleteSupplier} className="mt-4 grid gap-3 rounded-xl border border-red-300 bg-white p-4">
      <input type="hidden" name="supplierId" value={supplier.id.toString()}/><input type="hidden" name="supplierName" value={supplier.name}/><p className="text-sm font-bold">الخطوة 2: لا توجد منتجات أو طلبات. يمكنك حذف ملف المورد نهائيًا.</p>
      <label className="text-sm">اكتب اسم المورد كما يظهر: <b>{supplier.name}</b><input className={input} name="confirmName" autoComplete="off" required /></label>
      <label className="text-sm">اكتب العبارة: <b>حذف المورد نهائياً</b><input className={input} name="confirmPhrase" autoComplete="off" required /></label>
      <label className="text-sm"><input type="checkbox" name="acknowledge" value="1" required/> أفهم أن ملف المورد وربطه بسلة سيحذفان نهائيًا.</label>
      <button className="w-fit rounded-lg bg-red-800 px-4 py-2 font-bold text-white">حذف المورد نهائيًا</button>
    </form>}
  </details>;
}
export default async function Suppliers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin=await requireAction('suppliers', 'view');
  const canDelete=await hasAction(admin.uid,'suppliers','delete');
  const query = await searchParams;
  const rawPage = query.page;
  if (rawPage !== undefined && (typeof rawPage !== 'string' || !/^[1-9]\d{0,5}$/.test(rawPage) || Number(rawPage) > 100000)) notFound();
  const page = rawPage === undefined ? 1 : Number(rawPage);
  const offset = (page - 1) * 100;
  try { await assertCommerceSchemaReady(prisma); } catch { return <p role="alert" className="card-3d rounded-xl p-5">مخطط الموردين غير جاهز؛ يلزم استكمال الجداول والفهارس قبل الإدارة.</p>; }
  const [suppliers, mappings] = await Promise.all([
    prisma.$queryRaw<Supplier[]>`SELECT s.id,s.name,s.contact_name,s.phone,s.email,s.address,s.registration_number,s.tax_number,s.settlement_terms,s.notes,s.active,s.api_base_url,s.api_credential_ref,o.store_url,i.status AS invite_status,i.generation AS invite_generation,i.encrypted_draft AS invite_draft,i.expires_at AS invite_expires,
      ((SELECT COUNT(*) FROM supplier_products p WHERE p.supplier_id=s.id)+(SELECT COUNT(*) FROM commerce_product_suppliers m WHERE m.supplier_id=s.id)) AS product_count,
      ((SELECT COUNT(*) FROM supplier_orders so WHERE so.supplier_id=s.id)+(SELECT COUNT(*) FROM commerce_order_suppliers os WHERE os.supplier_id=s.id)+(SELECT COUNT(*) FROM commerce_supplier_accruals a WHERE a.supplier_id=s.id)) AS history_count,
      (SELECT COUNT(*) FROM supplier_connections c WHERE c.supplier_id=s.id) AS connection_count
      FROM commerce_suppliers s LEFT JOIN supplier_onboarding o ON o.supplier_id=s.id LEFT JOIN supplier_data_invitations i ON i.supplier_id=s.id ORDER BY s.id DESC LIMIT 100 OFFSET ${offset}`,
    prisma.$queryRaw<Mapping[]>`SELECT m.product_id,m.supplier_id,m.supplier_sku,m.unit_cost_minor,p.title,s.name AS supplier_name,s.active AS supplier_active FROM commerce_product_suppliers m JOIN commerce_products p ON p.id=m.product_id JOIN commerce_suppliers s ON s.id=m.supplier_id ORDER BY m.product_id DESC LIMIT 100 OFFSET ${offset}`,
  ]);
  return <div className="space-y-4">
    <h1 className="text-xl font-bold text-primary">الموردون وربط السلع</h1>
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-950">افتح بطاقة المورد ثم أنشئ «رابط بيانات المورد» وأرسله لصاحب المتجر. سيظهر طلبه هنا للمراجعة والاعتماد.</p>
    <Link href="/admin/suppliers/onboarding" className="inline-block rounded-lg bg-amber-100 px-4 py-2 font-bold text-slate-900">Excel — خيار احتياطي</Link>
    <Link href="/admin/suppliers/catalog" className="inline-block rounded-lg bg-primary px-4 py-2 font-bold text-white">اختيار منتجات سلة</Link>
    <Link href="/admin/suppliers/integrations" className="inline-block rounded-lg bg-primary px-4 py-2 text-white">تكامل Salla وكتالوج الموردين</Link>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">الموردون جهات داخلية لتربح. التنفيذ والتسوية خارج الموقع. لا تحويل أموال ولا اتصال API من هذه الصفحة.</p>
    <nav className="flex flex-wrap gap-4 text-primary underline"><Link href="/admin/commerce">السلع والطلبات</Link><Link href="/admin/commerce/accounts">الإيصالات والاستحقاقات</Link></nav>
    {query.saved === '1' && <p role="status" className="text-emerald-700">تم الحفظ.</p>}
    {query.data==='approved'&&<p role="status" className="text-emerald-700">تم اعتماد بيانات المورد وأصبحت روابط المتجر والتفويض متاحة.</p>}
    {query.data==='reopened'&&<p role="status" className="text-emerald-700">أعيد النموذج للمورد للتصحيح.</p>}
    {query.deleted==='products'&&<p role="status" className="text-emerald-700">تم حذف منتجات المورد. راجع المورد ثم نفّذ خطوة حذف ملفه إذا رغبت.</p>}
    {query.deleted==='supplier'&&<p role="status" className="text-emerald-700">تم حذف المورد بعد التأكد من خلوه من المنتجات وسجل الطلبات.</p>}
    {typeof query.error === 'string' && <p role="alert" className="text-red-700">{query.error==='delete_products_first'?'احذف منتجات المورد أولًا ثم أعد محاولة حذف المورد.':query.error==='delete_history'?'لا يمكن الحذف لأن للمورد سجل طلبات أو استحقاقات يجب حفظه.':query.error==='delete_confirmation'?'لم تتطابق بيانات التأكيد. اكتب اسم المورد والعبارة المطلوبة حرفيًا.':'تعذر إكمال العملية. راجع الحقول وجاهزية الجداول.'}</p>}
    <details className="card-3d rounded-xl p-4"><summary className="mb-3 cursor-pointer font-bold">إضافة مورد</summary><SupplierForm /></details>
    <nav aria-label="صفحات الموردين وروابط السلع" className="flex flex-wrap items-center gap-4 text-primary">
      {page > 1 && <Link className="underline" href={`/admin/suppliers?page=${page - 1}`}>الصفحة السابقة</Link>}
      <span>الصفحة {page} — حتى 100 مورد و100 رابط في الصفحة</span>
      {page < 100000 && (suppliers.length === 100 || mappings.length === 100) && <Link className="underline" href={`/admin/suppliers?page=${page + 1}`}>الصفحة التالية</Link>}
    </nav>
    <section className="space-y-3"><h2 className="font-bold">الموردون — الصفحة {page}</h2>
      {!suppliers.length && <p className="text-sm">لا يوجد موردون في هذه الصفحة.</p>}
      {suppliers.map(s => {let inviteValues:OnboardingValues={};if(s.invite_draft&&s.invite_generation)try{inviteValues=decryptInvitationDraft(s.invite_draft,s.id,s.invite_generation,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'');}catch{}const invitation=s.invite_status&&s.invite_generation&&s.invite_expires?{status:s.invite_status,generation:s.invite_generation,expiresAt:s.invite_expires.toISOString(),values:inviteValues}:null;return <details key={s.id.toString()} className="card-3d rounded-xl p-4"><summary className="mb-3 cursor-pointer">#{s.id.toString()} {s.name} — {s.active === 1 ? 'نشط' : 'غير نشط'}{s.invite_status==='submitted'?' — بيانات بانتظار المراجعة':''}</summary><SupplierForm supplier={s}/><SupplierDataInvitePanel supplierId={s.id.toString()} supplierName={s.name} invitation={invitation} approvedStoreUrl={s.store_url} connected={Number(s.connection_count)>0} approveAction={approveSupplierData} reopenAction={reopenSupplierData}/>{canDelete&&<SupplierDeletion supplier={s}/>}</details>;})}
    </section>
    <section className="card-3d space-y-3 rounded-xl p-4"><h2 className="font-bold">اختيار منتجات المورد</h2><p className="text-sm">ابحث بالاسم أو SKU، عاين الصور والتفاصيل، ثم راجع المنتجات المحددة قبل إضافتها إلى تربح. المنتجات تبقى مخفية بعد الإضافة.</p><Link href="/admin/suppliers/catalog" className={`${button} inline-flex min-h-11 items-center`}>عرض المنتجات واختيارها</Link></section>
    <section className="space-y-3"><h2 className="font-bold">روابط السلع — الصفحة {page}</h2>
      {!mappings.length && <p className="text-sm">لا توجد روابط سلع في هذه الصفحة.</p>}
      {mappings.map(m => <details key={m.product_id.toString()} className="card-3d rounded-xl p-4"><summary className="mb-3 cursor-pointer">{m.title} · {m.supplier_name} · {formatSar(m.unit_cost_minor)} ر.س</summary><MappingForm mapping={m} suppliers={suppliers} /></details>)}
    </section>
  </div>;
}
