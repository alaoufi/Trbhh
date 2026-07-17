import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell, MessageCircle, Star, MessagesSquare, Sparkles, Archive, CheckCheck, ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { timeAgo } from '@/lib/utils';
import { openNotifAction, archiveAllNotifsAction } from './actions';
import { AdminPager } from '@/components/admin-pager';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'التنبيهات' };

/* تصنيفات التنبيهات — لكل نوع لون وأيقونة مميزة */
const KINDS = [
  { key: 'message', label: 'الرسائل', icon: MessageCircle, color: '#0ea5e9', bg: 'bg-sky-50', border: 'border-sky-400', text: 'text-sky-800' },
  { key: 'comment', label: 'التعليقات', icon: MessagesSquare, color: '#8b5cf6', bg: 'bg-violet-50', border: 'border-violet-400', text: 'text-violet-800' },
  { key: 'review', label: 'التقييمات', icon: Star, color: '#f59e0b', bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-800' },
  { key: 'warning', label: 'تنبيهات وإنذارات', icon: ShieldAlert, color: '#dc2626', bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-800' },
  { key: 'other', label: 'أخرى', icon: Sparkles, color: '#64748b', bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700' },
] as const;
type Kind = typeof KINDS[number];
const kindOf = (t: string | null): Kind => KINDS.find((k) => k.key === t) || KINDS.find((k) => k.key === 'other')!;

const PAGE_SIZE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { tab: tabRaw, page: pageRaw } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || '1') || 1);

  const all = await prisma.notfications.findMany({
    where: { user_id: String(session.uid) },
    orderBy: { id: 'desc' },
    take: 500,
  }).catch(() => []);

  const fresh = all.filter((n) => !n.read_at);
  const archived = all.filter((n) => !!n.read_at);
  const countBy = (key: string) => fresh.filter((n) => kindOf(n.type).key === key).length;

  const TABS = [
    { key: 'all', label: 'الجديدة', count: fresh.length, cls: 'bg-primary' },
    ...KINDS.map((k) => ({ key: k.key, label: k.label, count: countBy(k.key), cls: '' })),
    { key: 'archive', label: 'الأرشيف', count: archived.length, cls: 'bg-slate-500' },
  ];
  const tab = TABS.some((t) => t.key === tabRaw) ? (tabRaw as string) : 'all';
  const filtered = tab === 'archive' ? archived : tab === 'all' ? fresh : fresh.filter((n) => kindOf(n.type).key === tab);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">التنبيهات</h1>
        {fresh.length > 0 && <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-extrabold text-white">{fresh.length} جديد</span>}
        {fresh.length > 0 && (
          <form action={archiveAllNotifsAction} className="mr-auto">
            <ConfirmSubmit msg="نقل كل التنبيهات الجديدة إلى الأرشيف؟" className="flex items-center gap-1.5 rounded-full border-2 border-primary/25 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">
              <CheckCheck className="h-3.5 w-3.5" /> نقل الكل للأرشيف
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {/* التصنيفات + الأرشيف */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary/40 p-1.5">
        {TABS.map((t) => {
          const k = KINDS.find((x) => x.key === t.key);
          return (
            <Link key={t.key} href={`/notifications?tab=${t.key}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${tab === t.key ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-white/60'}`}>
              {t.key === 'archive' ? <Archive className="h-4 w-4" /> : k ? <k.icon className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {t.label}
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: k?.color || (t.key === 'archive' ? '#64748b' : '#3287da') }}>{t.count}</span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="card-3d rounded-2xl p-8 text-center text-muted-foreground">
          <Bell className="mx-auto mb-2 h-8 w-8" /> {tab === 'archive' ? 'الأرشيف فارغ.' : 'لا توجد تنبيهات جديدة — كل شيء تمام ✓'}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((n) => {
          const k = kindOf(n.type);
          const isNew = !n.read_at;
          return (
            <form key={String(n.id)} action={openNotifAction}>
              <input type="hidden" name="id" value={String(n.id)} />
              <button className={`flex w-full items-center gap-3 rounded-xl border-r-4 p-3 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow ${isNew ? `${k.bg} ${k.border}` : 'border-slate-200 bg-card opacity-80'}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: isNew ? k.color : '#94a3b8' }}>
                  <k.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-bold ${isNew ? k.text : 'text-muted-foreground'}`}>{n.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}{!isNew ? ' • مقروء' : ''}</span>
                </span>
                {isNew && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: k.color }}>جديد</span>}
              </button>
            </form>
          );
        })}
      </div>

      <AdminPager basePath="/notifications" page={page} pages={pages} total={filtered.length} params={{ tab }} />
    </div>
  );
}
