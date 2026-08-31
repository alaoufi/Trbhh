import Link from 'next/link';
import { Archive, ArrowRight, CheckCircle2, MessageCircleReply, MessagesSquare, RotateCcw, Trash2 } from 'lucide-react';
import { requirePerm, hasAction } from '@/lib/roles';
import { getAdminThread, listAdminInboxThreads } from '@/lib/chat';
import { getPrimaryAdminId } from '@/lib/admin-inbox';
import { timeAgo } from '@/lib/utils';
import { archiveAdminMessageThreadAction, deleteArchivedAdminMessageThreadAction, restoreAdminMessageThreadAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراسلات الإدارة' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
type Params = { tab?: string; member?: string; a?: string; b?: string };

export default async function AdminMessages({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requirePerm('messages');
  const { tab: rawTab, member, b } = await searchParams;
  const tab = rawTab === 'archived' ? 'archived' : 'open';
  const adminId = await getPrimaryAdminId();
  // `b` retains compatibility with old monitoring links; new links use member.
  const memberId = Number(member || b || 0);
  const [canEdit, canDelete] = await Promise.all([hasAction(session.uid, 'messages', 'edit'), hasAction(session.uid, 'messages', 'delete')]);

  if (memberId > 0 && memberId !== adminId) {
    const thread = await getAdminThread(adminId, memberId);
    return <div className="mx-auto max-w-2xl space-y-3">
      <Link href={`/admin/messages?tab=${tab}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" /> {tab === 'archived' ? 'أرشيف المراسلات' : 'مراسلات تحتاج إجراء'}</Link>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="flex items-center gap-2 text-lg font-bold text-primary"><MessagesSquare className="h-5 w-5" /> {thread.bName}</h1><p className="text-xs text-muted-foreground">{tab === 'archived' ? 'هذه المحادثة مؤرشفة ولا تظهر في التنبيهات.' : 'اختر رداً أو أرشف المحادثة بعد إنهاء الإجراء.'}</p></div>
        <div className="flex flex-wrap gap-2">
          {tab === 'open' && <Link href={`/messages/${memberId}`} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"><MessageCircleReply className="h-4 w-4" /> الرد على العضو</Link>}
          {tab === 'open' && canEdit && <form action={archiveAdminMessageThreadAction}><input type="hidden" name="memberId" value={memberId} /><ConfirmSubmit msg="أرشفة هذه المحادثة؟ ستخرج من التنبيهات ويمكن استعادتها لاحقاً من الأرشيف." title="أرشفة المحادثة" className="inline-flex items-center gap-1 rounded-lg border border-amber-500 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50"><Archive className="h-4 w-4" /> أرشفة المحادثة</ConfirmSubmit></form>}
          {tab === 'archived' && canEdit && <form action={restoreAdminMessageThreadAction}><input type="hidden" name="memberId" value={memberId} /><button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary hover:bg-primary/5"><RotateCcw className="h-4 w-4" /> استعادة للمراسلات المفتوحة</button></form>}
          {tab === 'archived' && canDelete && <form action={deleteArchivedAdminMessageThreadAction}><input type="hidden" name="memberId" value={memberId} /><ConfirmSubmit msg="حذف المحادثة المؤرشفة وجميع رسائلها نهائياً؟ لا يمكن التراجع أو الاستعادة بعد الحذف." title="حذف المحادثة نهائياً" className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700"><Trash2 className="h-4 w-4" /> حذف المحادثة نهائياً</ConfirmSubmit></form>}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: '#e5ddd5' }}>{thread.messages.length === 0 && <p className="m-auto py-6 text-sm text-gray-600">لا رسائل.</p>}{thread.messages.map((m) => <div key={m.id} className="max-w-[85%] self-start rounded-2xl bg-white px-3 py-1.5 text-sm shadow-sm"><div className="mb-0.5 text-[11px] font-bold text-primary">{m.senderName}</div><p className="whitespace-pre-wrap break-words leading-relaxed text-gray-900">{m.message}</p><span className="mt-0.5 block text-[10px] text-gray-500">{timeAgo(m.at)}</span></div>)}</div>
    </div>;
  }

  const threads = adminId ? await listAdminInboxThreads(adminId, tab) : [];
  return <div className="space-y-4">
    <div className="flex items-center gap-2"><MessagesSquare className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">مراسلات الإدارة</h1></div>
    <p className="text-sm text-muted-foreground">عالج المراسلة بالرد أو الأرشفة. الحذف النهائي متاح فقط من الأرشيف بعد تأكيد صريح.</p>
    <div className="flex flex-wrap gap-2 rounded-xl bg-secondary/70 p-2"><Link href="/admin/messages?tab=open" className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === 'open' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background'}`}>تحتاج إجراء</Link><Link href="/admin/messages?tab=archived" className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === 'archived' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background'}`}>الأرشيف</Link></div>
    {threads.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{tab === 'archived' ? 'لا توجد مراسلات مؤرشفة.' : 'لا توجد مراسلات تحتاج إجراء الآن.'}</div>}
    <div className="space-y-2">{threads.map((thread) => <Link key={thread.memberId} href={`/admin/messages?tab=${tab}&member=${thread.memberId}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:border-primary/40"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MessagesSquare className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-1 truncate text-sm font-bold text-primary">{thread.memberName}{thread.unread > 0 && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{en(thread.unread)} جديد</span>}</span><span className="block truncate text-xs text-muted-foreground">{thread.last}</span></span><span className="shrink-0 text-left text-[11px] text-muted-foreground"><span className="block rounded-full bg-secondary px-2 py-0.5">{en(thread.count)} رسالة</span><span className="mt-1 block">{timeAgo(thread.at)}</span></span></Link>)}</div>
    {tab === 'archived' && <p className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> الأرشفة لا تحذف الرسائل ولا تظهر المحادثة ضمن التنبيهات.</p>}
  </div>;
}
