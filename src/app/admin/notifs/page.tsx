import Link from 'next/link';
import { BellRing, Trash2, User } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { timeAgo, toInt } from '@/lib/utils';
import { adminDeleteNotifAction, adminClearReadNotifsAction } from '../actions';
import { AdminPager } from '@/components/admin-pager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تنبيهات الأعضاء' };

const TYPE_LABEL: Record<string, string> = { message: 'رسالة', comment: 'تعليق', review: 'تقييم' };

const PAGE_SIZE = 30;

export default async function AdminNotifsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  await requireAction('messages', 'view');
  const { tab: tabRaw, q, page: pageRaw } = await searchParams;
  const tab = tabRaw === 'new' || tabRaw === 'read' ? tabRaw : 'all';
  const page = Math.max(1, parseInt(pageRaw || '1') || 1);

  const where = {
    ...(tab === 'new' ? { read_at: null } : tab === 'read' ? { NOT: { read_at: null } } : {}),
    ...(q?.trim() ? { OR: [{ title: { contains: q.trim() } }, { user_id: q.trim() }] } : {}),
  };
  const [rows, filteredTotal, counts] = await Promise.all([
    prisma.notfications.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }).catch(() => []),
    prisma.notfications.count({ where }).catch(() => 0),
    Promise.all([
      prisma.notfications.count().catch(() => 0),
      prisma.notfications.count({ where: { read_at: null } }).catch(() => 0),
      prisma.notfications.count({ where: { NOT: { read_at: null } } }).catch(() => 0),
    ]),
  ]);
  const [allC, newC, readC] = counts;
  const pages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  // أسماء الأعضاء لعرضها بجانب كل تنبيه
  const uids = [...new Set(rows.map((r) => Number(r.user_id)).filter(Boolean))];
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));

  const TABS = [
    { key: 'all', label: 'الكل', count: allC, cls: 'bg-slate-500' },
    { key: 'new', label: 'غير مقروءة', count: newC, cls: 'bg-amber-500' },
    { key: 'read', label: 'مقروءة (الأرشيف)', count: readC, cls: 'bg-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">تنبيهات الأعضاء</h1>
        {readC > 0 && (
          <form action={adminClearReadNotifsAction} className="mr-auto">
            <button className="flex items-center gap-1.5 rounded-full border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> حذف كل المقروء ({readC})</button>
          </form>
        )}
      </div>
      <p className="text-sm text-muted-foreground">اطّلع على تنبيهات النظام المرسلة للأعضاء (رسائل/تعليقات/تقييمات) واحذف ما تشاء — الحذف لا يمس الرسالة أو التعليق نفسه.</p>

      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary/40 p-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/notifs?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${tab === t.key ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-white/60'}`}>
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${t.cls}`}>{t.count}</span>
          </Link>
        ))}
      </div>

      <form className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={q} placeholder="بحث بعنوان التنبيه أو رقم العضو…" className="h-10 flex-1 rounded-lg border border-primary/30 bg-background px-3 text-sm" />
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">بحث</button>
      </form>

      {rows.length === 0 && <p className="py-10 text-center text-muted-foreground">لا توجد تنبيهات.</p>}
      <div className="space-y-2">
        {rows.map((n) => (
          <div key={String(n.id)} className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm ${n.read_at ? 'border-slate-200 bg-card opacity-80' : 'border-amber-300 bg-amber-50/60'}`}>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${n.read_at ? 'bg-slate-400' : 'bg-amber-500'}`}>{n.read_at ? 'مقروء' : 'جديد'}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{TYPE_LABEL[n.type || ''] || 'أخرى'}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{n.title}</span>
            <Link href={`/admin/users/${Number(n.user_id) || 0}`} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"><User className="h-3.5 w-3.5" /> {nameById.get(Number(n.user_id)) || `#${n.user_id}`}</Link>
            <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
            <form action={adminDeleteNotifAction}>
              <input type="hidden" name="id" value={String(n.id)} />
              <input type="hidden" name="tab" value={tab} />
              <button aria-label="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
            </form>
          </div>
        ))}
      </div>

      <AdminPager basePath="/admin/notifs" page={page} pages={pages} total={filteredTotal} params={{ tab, q }} />
    </div>
  );
}
