import { AccessPage } from '@/components/access-boundary';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/access-control/guards';
import { prisma } from '@/lib/prisma';
import { formatSar } from '@/lib/commerce/money';
export const dynamic='force-dynamic';
export const metadata={title:'الطلبات والمبيعات'};
export default async function OrdersPage(){
 await requireAdminPage('/admin/orders');
 const orders=await prisma.commerce_orders.findMany({select:{id:true,status:true,fulfillment_status:true,total_minor:true,created_at:true},orderBy:{id:'desc'},take:100});
 return <section dir="rtl" className="space-y-4"><h1 className="text-2xl font-bold text-[#16294A]">الطلبات والمبيعات</h1><p className="text-sm text-slate-500">آخر 100 طلب. افتح الطلب لمراجعة البنود المحفوظة وقت الشراء.</p><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-right text-sm"><thead><tr className="bg-slate-50"><th className="p-3">الطلب</th><th>التاريخ</th><th>الإجمالي</th><th>حالة الدفع</th><th>حالة التنفيذ</th></tr></thead><tbody>{orders.map(row=><tr key={String(row.id)} className="border-t"><td className="p-3"><AccessPage href={'/admin/commerce/orders/'+row.id}><Link href={'/admin/commerce/orders/'+row.id} className="font-bold text-primary underline">#{String(row.id)}</Link></AccessPage></td><td>{row.created_at.toLocaleDateString('ar-SA')}</td><td>{formatSar(row.total_minor)} ر.س</td><td>{row.status}</td><td>{row.fulfillment_status}</td></tr>)}</tbody></table>{!orders.length&&<p className="p-8 text-center text-slate-500">لا توجد طلبات مسجلة حتى الآن.</p>}</div></section>;
}
