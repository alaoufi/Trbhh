import Link from 'next/link';
import {randomUUID} from 'node:crypto';
import {requireAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {getSetting} from '@/lib/settings';
import {assertSupplierSchemaReady} from '@/lib/suppliers/schema';
import {formatSar} from '@/lib/commerce/money';
import {SupplierOwnerInviteButton} from '@/components/supplier-owner-invite-button';
import {saveProfile,saveProduct,connectSalla,disconnectSalla,synchronize,saveTier,disableProduct,saveTrackingLabels} from './actions';
export const dynamic='force-dynamic';
export const metadata={title:'تكامل الموردين',robots:{index:false,follow:false}};
const input='w-full rounded-lg border border-primary/25 bg-white px-2 py-1.5 text-sm';
const button='rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white';
type Profile={id:bigint;name:string;active:number;provider:string|null;maintenance:number|null;sync_enabled:number|null;auto_orders_enabled:number|null;mode:string|null;last_sync_at:Date|null;last_error:string|null};
type Connection={id:bigint;supplier_id:bigint;external_store_id:string;status:string};
type Product={id:bigint;supplier_id:bigint;name:string;sku:string;public_price_minor:number;unit_cost_minor:number|null;selling_price_minor:number|null;quantity:number|null;active:number;visible:number;featured:number;revision:number;pricing_policy:string;discount_minor:number;discount_bps:number;minimum_price_minor:number;minimum_margin_minor:number;last_sync_at:Date|null;sync_error:string;reserved:bigint;remaining:bigint;held:bigint};
const resultText:Record<string,string>={saved:'تم حفظ الإعدادات.',connected:'تم ربط متجر سلة.',disconnected:'تم فصل الاتصال وحذف التوكنات المخزنة.',synced:'اكتملت المزامنة. المنتجات الجديدة مخفية وغير نشطة.',connection_failed:'تعذر الربط. تحقق من إعدادات البيئة والصلاحيات ثم أعد المحاولة.',sync_failed:'لم تكتمل المزامنة؛ راجع حالة المورد وتفعيل المزامنة وإعادة الربط عند الحاجة.',save_failed:'تعذر الحفظ؛ تحقق من البيانات.',product_failed:'تعذر حفظ المنتج: راجع حد الربح وحالة المورد وتحديث الصفحة. المنتجات ذات الخيارات تحتاج ربط خيارات الشراء قبل تفعيلها.'};
export default async function Integrations({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 await requireAction('suppliers','view');
 try {await assertSupplierSchemaReady(prisma);}catch{return <p role="alert">مخطط التكامل غير جاهز. لم يتم تغيير بيانات الموردين.</p>;}
 const query=await searchParams,page=typeof query.page==='string'&&/^[1-9]\d{0,3}$/.test(query.page)?Number(query.page):1,offset=(page-1)*25;
 const supplierPage=typeof query.suppliers==='string'&&/^[1-9]\d{0,3}$/.test(query.suppliers)?Number(query.suppliers):1,supplierOffset=(supplierPage-1)*25;
 const connectionPage=typeof query.connections==='string'&&/^[1-9]\d{0,3}$/.test(query.connections)?Number(query.connections):1,connectionOffset=(connectionPage-1)*50;
 const trackingFields=[['supplier_tracking_title','عنوان التتبع','تتبع الشحن'],['supplier_tracking_carrier_label','عنوان شركة الشحن','شركة الشحن'],['supplier_tracking_number_label','عنوان رقم التتبع','رقم التتبع'],['supplier_tracking_status_label','عنوان حالة الشحن','حالة الشحن'],['supplier_tracking_notice','نص تنبيه تحديث الشحنة','تم تحديث شحنة طلبك']];
 const trackingLabels=await Promise.all(trackingFields.map(([key,,fallback])=>getSetting(key,fallback)));
 const [profiles,connections,products]=await Promise.all([
 prisma.$queryRaw<Profile[]>`SELECT s.id,s.name,s.active,p.provider,p.maintenance,p.sync_enabled,p.auto_orders_enabled,p.mode,p.last_sync_at,p.last_error FROM commerce_suppliers s LEFT JOIN supplier_integration_profiles p ON p.supplier_id=s.id ORDER BY s.id DESC LIMIT 25 OFFSET ${supplierOffset}`,
 prisma.$queryRaw<Connection[]>`SELECT c.id,c.supplier_id,c.external_store_id,c.status FROM supplier_connections c JOIN (SELECT id FROM commerce_suppliers ORDER BY id DESC LIMIT 25 OFFSET ${supplierOffset}) s ON s.id=c.supplier_id ORDER BY c.id DESC LIMIT 50 OFFSET ${connectionOffset}`,
 prisma.$queryRaw<Product[]>`SELECT p.id,p.supplier_id,p.name,p.sku,p.public_price_minor,p.unit_cost_minor,p.selling_price_minor,p.quantity,p.active,p.visible,p.featured,p.revision,p.pricing_policy,p.discount_minor,p.discount_bps,p.minimum_price_minor,p.minimum_margin_minor,p.last_sync_at,p.sync_error,COALESCE((SELECT SUM(quantity) FROM supplier_stock_reservations r WHERE r.supplier_product_id=p.id),0) AS reserved,COALESCE((SELECT SUM(remaining_quantity) FROM supplier_stock_reservations r WHERE r.supplier_product_id=p.id),0) AS remaining,COALESCE((SELECT SUM(held_quantity) FROM supplier_stock_reservations r WHERE r.supplier_product_id=p.id),0) AS held FROM supplier_products p ORDER BY p.id DESC LIMIT 25 OFFSET ${offset}`]);
 return <div className="space-y-4" dir="rtl">
 <h1 className="text-2xl font-bold text-primary">تكامل الموردين</h1><Link href="/admin/suppliers" className="underline">ملفات الموردين وإضافة مورد</Link>
 <Link href="/admin/suppliers/catalog" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 font-bold text-white">اختيار منتجات سلة — الصور والمعاينة</Link>
 <details className="card-3d rounded-lg p-3"><summary>نصوص تتبع الشحن للعملاء</summary><form action={saveTrackingLabels} className="mt-2 grid gap-2 sm:grid-cols-2">{trackingFields.map(([key,label],i)=><label key={key}>{label}<input className={input} name={key} maxLength={100} required defaultValue={trackingLabels[i]}/></label>)}<button className={button}>حفظ النصوص</button></form></details>
 <p className="rounded-lg bg-amber-50 p-3 text-sm">وضع التطوير هو الافتراضي. لا يتم دفع قيمة للمورد من هنا. الاستيراد لا ينشر المنتجات، وتفعيل الطلبات الحقيقية يحتاج اجتياز الاختبار وإعداد الخادم بصورة مستقلة.</p>
 {typeof query.result==='string'&&resultText[query.result]&&<p role="status" className="card-3d p-3">{resultText[query.result]}</p>}
 <section className="space-y-3">{profiles.map(s=><article key={String(s.id)} className="card-3d space-y-3 rounded-xl p-4">
 <h2 className="font-bold">{s.name} — #{String(s.id)}</h2>
 <form action={saveProfile} className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="supplierId" value={String(s.id)}/>
 <label>المزود<select name="provider" className={input} defaultValue={s.provider||'salla'}><option value="salla">Salla</option><option value="cj">CJ (الموصل قيد التجهيز)</option><option value="other">Other</option></select></label>
 <label>بيئة الطلبات<select name="mode" className={input} defaultValue={s.mode||'development'}><option value="development">Development — محاكاة</option><option value="live">Live — يتطلب سماح الخادم</option></select></label>
 {[['active','المورد نشط',s.active],['maintenance','وضع الصيانة',s.maintenance],['syncEnabled','مزامنة المنتجات',s.sync_enabled],['autoOrdersEnabled','إنشاء الطلبات التلقائي',s.auto_orders_enabled]].map(([name,label,value])=><label key={String(name)} className="flex items-center gap-2"><input name={String(name)} type="checkbox" value="1" defaultChecked={value===1}/>{label}</label>)}
 <button className={button}>حفظ إعدادات المورد</button></form>
 <p className="text-xs">آخر مزامنة: {s.last_sync_at?.toISOString()||'لم تتم'} · حالة الخطأ: {s.last_error||'لا يوجد'}</p>
 {s.provider==='salla'&&!connections.some(c=>c.supplier_id===s.id)&&<SupplierOwnerInviteButton supplierId={String(s.id)} supplierName={s.name}/>}
 {s.provider==='salla'&&<details><summary className="cursor-pointer text-sm underline">ربط مباشر من جلسة المشرف</summary><form action={connectSalla} className="mt-2"><input type="hidden" name="supplierId" value={String(s.id)}/><button className={button}>متابعة الربط في Salla</button></form></details>}
 {connections.filter(c=>c.supplier_id===s.id).map(c=><div key={String(c.id)} className="flex flex-wrap items-center gap-2 rounded border p-2"><span>المتجر {c.external_store_id} · {c.status}</span><form action={synchronize}><input type="hidden" name="id" value={String(c.id)}/><button className={button}>مزامنة الآن</button></form><form action={disconnectSalla}><input type="hidden" name="id" value={String(c.id)}/><button className="rounded border px-3 py-2">فصل الاتصال</button></form></div>)}
 </article>)}</section>
 <nav className="flex flex-wrap gap-4 text-sm" aria-label="صفحات الموردين والاتصالات">{supplierPage>1&&<Link href={`?suppliers=${supplierPage-1}&page=${page}`}>الموردون السابقون</Link>}{profiles.length===25&&<Link href={`?suppliers=${supplierPage+1}&page=${page}`}>الموردون التاليون</Link>}{connectionPage>1&&<Link href={`?suppliers=${supplierPage}&connections=${connectionPage-1}&page=${page}`}>الاتصالات السابقة</Link>}{connections.length===50&&<Link href={`?suppliers=${supplierPage}&connections=${connectionPage+1}&page=${page}`}>الاتصالات التالية</Link>}</nav>
 <h2 className="text-xl font-bold">إعدادات أسعار المنتجات والنشر — الصفحة {page}</h2>
 <p className="text-sm">لاختيار منتجات جديدة استخدم <Link href="/admin/suppliers/catalog" className="font-bold underline">كتالوج منتجات سلة</Link>. الإظهار والتنشيط هنا قرار يدوي مستقل عن الاستيراد.</p>
 {!products.length&&<p>لا توجد منتجات مستوردة في هذه الصفحة.</p>}
 {products.map(p=><article key={String(p.id)} className="card-3d space-y-3 rounded-xl p-4"><h3 className="font-bold">{p.name} · {p.sku}</h3>
 <p className="text-sm">سعر المصدر: {formatSar(p.public_price_minor)} ر.س · الربح: {p.selling_price_minor!==null&&p.unit_cost_minor!==null?formatSar(p.selling_price_minor-p.unit_cost_minor):'غير محدد'} · المخزون: {p.quantity??'غير محدد'} · الحجز: {String(p.reserved)} · المتبقي: {String(p.remaining)} · معلق للدفع: {String(p.held)}</p>
 <p className="text-xs">آخر مزامنة: {p.last_sync_at?.toISOString()||'لم تتم'} · {p.sync_error||'سليم'}</p>
 <form action={saveProduct} className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="id" value={String(p.id)}/><input type="hidden" name="revision" value={p.revision}/>
 {[['cost','تكلفة تربح',p.unit_cost_minor],['selling','سعر البيع اليدوي',p.selling_price_minor],['discount','الخصم الثابت',p.discount_minor],['minimumPrice','الحد الأدنى للسعر',p.minimum_price_minor],['minimumMargin','الحد الأدنى للربح',p.minimum_margin_minor]].map(([name,label,value])=><label key={String(name)}>{label}<input name={String(name)} className={input} inputMode="decimal" required defaultValue={value===null?'':formatSar(Number(value))}/></label>)}
 <label>سياسة السعر<select name="policy" className={input} defaultValue={p.pricing_policy}><option value="manual">يدوي</option><option value="source">نفس سعر المورد</option><option value="fixed_discount">أقل بمبلغ ثابت</option><option value="percent_discount">أقل بنسبة</option></select></label>
 <label>نسبة الخصم بنقاط الأساس (100 = 1%)<input name="discountBps" className={input} type="number" min="0" max="10000" defaultValue={p.discount_bps}/></label>
 {[['active','نشط',p.active],['visible','ظاهر للعملاء',p.visible],['featured','مميز',p.featured]].map(([name,label,value])=><label key={String(name)}><input name={String(name)} type="checkbox" value="1" defaultChecked={value===1}/> {label}</label>)}
 <button className={button}>تطبيق السعر وحفظ العرض</button><p className="text-xs sm:col-span-3">السعر يطبق عند الحفظ فقط، وليس عند المزامنة. إعادة تنشيط مورد لا تعيد تنشيط سلعه تلقائيًا.</p></form>
 <form action={disableProduct} className="flex gap-3"><input type="hidden" name="id" value={String(p.id)}/><button className="rounded border px-3 py-2">إيقاف دون تغيير السعر</button><button name="hide" value="1" className="rounded border px-3 py-2">إيقاف وإخفاء فورًا</button></form>
 <details><summary className="cursor-pointer">اتفاق أسعار الكميات / حجز مخزون</summary><form action={saveTier} className="mt-2 grid gap-2 sm:grid-cols-4"><input type="hidden" name="productId" value={String(p.id)}/><input type="hidden" name="submissionKey" value={randomUUID()}/><select name="kind" className={input}><option value="tier">شريحة سعر للكمية</option><option value="prepaid">حجز مدفوع مسبقًا خارج النظام</option><option value="commitment">التزام كمية / خصم متفق عليه</option></select><input name="quantity" type="number" min="1" max="1000000" required className={input} placeholder="الكمية"/><input name="cost" required className={input} placeholder="تكلفة الوحدة بالريال"/><button className={button}>تسجيل الاتفاق</button></form></details>
 </article>)}
 <nav className="flex gap-4">{page>1&&<Link href={`?page=${page-1}&suppliers=${supplierPage}&connections=${connectionPage}`}>السابق</Link>}{products.length===25&&<Link href={`?page=${page+1}&suppliers=${supplierPage}&connections=${connectionPage}`}>التالي</Link>}</nav>
 </div>;
}
