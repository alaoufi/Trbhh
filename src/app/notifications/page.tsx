import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell, MessageCircle, Star, MessagesSquare, Sparkles, Archive, CheckCheck, ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';
import { readMessageNotificationAction, openNotifAction, archiveAllNotifsAction } from './actions';
import { AdminPager } from '@/components/admin-pager';
import { ConfirmSubmit } from '@/components/confirm-submit';

import { canUseMemberChat } from '@/lib/chat-access';
import { notificationPageData } from '@/lib/notification-data';
import { messageNotificationDestination } from '@/lib/notification-policy';

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



export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; mp?: string; notice?:string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const {tab:tabRaw,page:pageRaw,mp:mpRaw,notice}=await searchParams;
  const tab=['all','archive',...KINDS.map(k=>k.key)].includes(tabRaw||'')?tabRaw!:'all';
  const canViewMessages=await canUseMemberChat(session.uid,'view');
  const data=await notificationPageData(session.uid,tab,Math.max(1,parseInt(pageRaw||'1')||1),Math.max(1,parseInt(mpRaw||'1')||1),canViewMessages);
  const {rows,page,pages,storedTotal,threads:unreadMsgThreads}=data;
  const freshCount=data.counts.stored;
  const TABS=[{key:'all',label:'الجديدة',count:data.counts.total},...KINDS.map(k=>({key:k.key,label:k.label,count:k.key==='message'?data.counts.messages:data.kindCounts.get(k.key)||0})),{key:'archive',label:'الأرشيف',count:data.archiveBadge}];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">التنبيهات</h1>
        {freshCount > 0 && <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-extrabold text-white">{freshCount} جديد</span>}
        {freshCount > 0 && (
          <form action={archiveAllNotifsAction} className="mr-auto">
            <ConfirmSubmit msg="نقل كل التنبيهات الجديدة إلى الأرشيف؟" className="flex items-center gap-1.5 rounded-full border-2 border-primary/25 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">
              <CheckCheck className="h-3.5 w-3.5" /> نقل الكل للأرشيف
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {notice==='source-unavailable'&&<p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">لا يحتوي هذا التنبيه على رابط مصدر صالح. احتُفظ بسجله في الأرشيف؛ قراءة التنبيه لا تعني معالجة سببه. راجع نص التنبيه ومرجع العملية مع الموظف المختص.</p>}
      {tab==='archive'&&<p className="text-sm text-muted-foreground">الأرشيف يحتفظ بالتنبيهات المقروءة. ظهور السجل هنا لا يعني وجود إجراء جديد، ولا يثبت إغلاق المشكلة الأصلية.</p>}
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

      {/* الرسائل غير المقروءة (حيّة) — تظهر في «الجديدة» و«الرسائل»، وتُمسح فور قراءتها */}
      {(tab === 'all' || tab === 'message' || tab === 'archive') && unreadMsgThreads.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{tab === 'archive' ? 'أرشيف الرسائل المستلمة' : 'الرسائل غير المقروءة'} — {data.threadTotal} مرسل</p>
          {unreadMsgThreads.map((t) => (
            <div key={t.id}><Link href={messageNotificationDestination(session.uid,t.id,tab !== 'archive' && t.exists,canViewMessages) || "/notifications?tab=message"} className="flex w-full items-center gap-3 rounded-xl border-r-4 border-sky-400 bg-sky-50 p-3 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500 text-white"><MessageCircle className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block whitespace-pre-wrap break-words text-sm font-bold text-sky-800">{canViewMessages ? `رسالة من ${t.name}` : tab === 'archive' ? 'رسائل إدارية مؤرشفة' : 'رسائل إدارية غير مقروءة'}{t.count > 1 ? ` (${t.count})` : ''}</span>
                <span className="block whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{canViewMessages ? t.last : 'يتطلب فتح هذه الرسائل صلاحية عرض المراسلات الإدارية.'}{t.at ? ` • ${timeAgo(t.at)}` : ''}</span>
              </span>
              <span className="shrink-0 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-extrabold text-white">{tab === 'archive' ? 'مقروء' : 'جديد'}</span>
            </Link>
            {canViewMessages && tab !== 'archive' && <form action={readMessageNotificationAction} className="px-3 py-1"><input type="hidden" name="sender" value={t.id}/><button className="text-xs text-primary">تعليم رسائل هذا التنبيه كمقروءة</button></form>}
            </div>
          ))}
        </div>
      )}

      {(tab==='all'||tab==='message'||tab==='archive') && data.messagePages>1 && <div className="flex justify-center gap-4 text-sm"><Link href={`/notifications?tab=${tab}&page=${page}&mp=${Math.max(1,data.messagePage-1)}`}>رسائل سابقة</Link><span>{tab === 'archive' ? 'أرشيف الرسائل' : 'صفحة الرسائل'} {data.messagePage} من {data.messagePages}</span><Link href={`/notifications?tab=${tab}&page=${page}&mp=${Math.min(data.messagePages,data.messagePage+1)}`}>رسائل تالية</Link></div>}
      {rows.length === 0 && !((tab === 'all' || tab === 'message' || tab === 'archive') && unreadMsgThreads.length > 0) && (
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
                  <span className={`block whitespace-pre-wrap break-words text-sm font-bold ${isNew ? k.text : 'text-muted-foreground'}`}>{n.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}{!isNew ? ' • مقروء' : ''}</span>
                </span>
                {isNew && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: k.color }}>{tab === 'archive' ? 'مقروء' : 'جديد'}</span>}
              </button>
            </form>
          );
        })}
      </div>

      <AdminPager basePath="/notifications" page={page} pages={pages} total={storedTotal} params={{ tab, mp: String(data.messagePage) }} />
    </div>
  );
}
