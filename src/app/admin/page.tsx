import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { requireAdminPage, readActorAccess } from '@/lib/access-control/guards';
import { canAccessPage } from '@/lib/access-control/catalog';
import { ADMIN_GROUPS } from '@/components/admin-nav-def';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة الإدارة' };
export default async function AdminHome() {
  const session = await requireAdminPage('/admin');
  const access = await readActorAccess(session.uid);
  const groups = ADMIN_GROUPS.map(group => ({ ...group, items: group.items.filter(item => item.href !== '/admin' && canAccessPage(access.keys, item.href)) })).filter(group => group.items.length);
  return <div className="space-y-6" dir="rtl">
    <header className="rounded-2xl bg-[#16294A] p-5 text-white sm:p-7"><ShieldCheck className="mb-3 h-8 w-8 text-[#F0B429]"/><h1 className="text-2xl font-bold">لوحة الإدارة</h1><p className="mt-2 text-sm text-slate-200">خدمات العمل مرتبة حسب الأقسام والصلاحيات الممنوحة لحسابك.</p><div className="mt-4 flex flex-wrap gap-2">{access.roles.map(role => <span key={role.id} className="rounded-full border border-white/20 px-3 py-1 text-xs">{role.name}</span>)}</div></header>
    {groups.map(group => <section key={group.key} className="space-y-3"><h2 className="text-lg font-bold text-[#16294A]">{group.title}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.items.map(({href,label,icon:Icon,description})=><Link key={href} href={href} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-amber-400 hover:shadow-sm"><span className="rounded-xl bg-slate-50 p-2 text-[#16294A]"><Icon className="h-5 w-5"/></span><div className="min-w-0 flex-1"><h3 className="font-bold text-[#16294A]">{label}</h3>{description&&<p className="mt-1 text-xs font-normal text-slate-500">{description}</p>}</div><ArrowLeft className="mt-2 h-4 w-4 shrink-0 text-amber-600"/></Link>)}</div></section>)}
    {!groups.length&&<p className="rounded-xl border p-4 text-sm">لا توجد خدمات إضافية ضمن صلاحياتك الحالية.</p>}
  </div>;
}
