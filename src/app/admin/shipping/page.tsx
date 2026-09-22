import { requireAdminPage } from '@/lib/access-control/guards';
import { prisma } from '@/lib/prisma';
export const dynamic='force-dynamic';
export const metadata={title:'الشحن والتتبع'};
export default async function ShippingPage(){
 await requireAdminPage('/admin/shipping');
 const shipments=await prisma.supplier_shipments.findMany({select:{id:true,supplier_order_id:true,carrier:true,tracking_number:true,status:true,fulfillment_status:true,updated_at:true},orderBy:{id:'desc'},take:100});
 return <section dir="rtl" className="space-y-4"><h1 className="text-2xl font-bold text-[#16294A]">الشحن والتتبع</h1><p className="text-sm text-slate-500">آخر 100 شحنة مسجلة لدى الموردين، كما وردت من مصدر التتبع.</p><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-right text-sm"><thead><tr className="bg-slate-50"><th className="p-3">طلب المورد</th><th>الناقل</th><th>رقم التتبع</th><th>حالة الشحنة</th><th>حالة التنفيذ</th><th>آخر تحديث</th></tr></thead><tbody>{shipments.map(row=><tr key={String(row.id)} className="border-t"><td className="p-3">#{String(row.supplier_order_id)}</td><td>{row.carrier||'غير متاح'}</td><td><bdi>{row.tracking_number||'غير متاح'}</bdi></td><td>{row.status||'غير متاح'}</td><td>{row.fulfillment_status||'غير متاح'}</td><td>{row.updated_at.toLocaleDateString('ar-SA')}</td></tr>)}</tbody></table>{!shipments.length&&<p className="p-8 text-center text-slate-500">لا توجد شحنات مسجلة حتى الآن.</p>}</div></section>;
}
