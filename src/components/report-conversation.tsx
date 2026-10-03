import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { getReportConversation, getReportedMemberContact, ReportAccessError, REPORT_FOLLOWUP_ENABLED } from '@/lib/report-followup';
import { getSettingBool } from '@/lib/settings';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { hasAction } from '@/lib/roles';
import { requireUser } from '@/lib/auth';
import { ReportReplyForm } from './report-reply-form';

export async function ReportConversation({ kind, id, admin = false }: { kind: string; id: string; admin?: boolean }) {
  let conversation;
  try { conversation = await getReportConversation(kind, id, admin); }
  catch (error) { if (error instanceof ReportAccessError) notFound(); throw error; }
  const enabled = await getSettingBool(REPORT_FOLLOWUP_ENABLED, true);
  const canReply = !admin || await hasAction((await requireUser()).uid, 'reports', 'add');
  const reportedMember = admin && canReply && enabled ? await getReportedMemberContact(kind, id) : null;
  return <div className="mx-auto max-w-2xl space-y-4">
    <Link href={admin ? '/admin/reports?tab=followup' : '/account/submitted-reports'} className="text-primary underline">العودة إلى البلاغات</Link>
    <h1 className="text-xl font-bold">متابعة البلاغ #{id}</h1>
    <p className="text-sm text-muted-foreground">المحادثة خاصة بصاحب البلاغ والإدارة المخوّلة. لا تظهر للعضو المُبلّغ عنه.</p>
    {reportedMember && <aside className="rounded-xl border bg-secondary/30 p-3">
      <Link href={`/messages/${reportedMember.id}`} className="inline-block rounded-lg bg-primary px-3 py-2 font-bold text-white">مراسلة المُبلّغ عنه</Link>
      <p className="mt-2 text-sm text-muted-foreground">تفتح محادثة منفصلة مع العضو المعني. لا يُرسل البلاغ أو ردوده تلقائيًا؛ تجنّب مشاركة هوية صاحب البلاغ أو رسائله الخاصة.</p>
    </aside>}
    <section className="rounded-xl border bg-secondary/30 p-4">
      <h2 className="font-bold">{conversation.report.title}</h2>
      <p className="whitespace-pre-wrap break-words">{conversation.report.body}</p>
    </section>
    <ol aria-label="ردود البلاغ" className="space-y-3">
      {conversation.replies.map(reply => <li key={String(reply.id)} className={`rounded-xl border p-3 ${reply.is_staff ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><b>{reply.is_staff ? 'الإدارة' : 'صاحب البلاغ'}</b><time dateTime={reply.created_at.toISOString()} className="text-muted-foreground">{reply.created_at.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</time></div>
        <p className="mt-2 whitespace-pre-wrap break-words">{reply.body}</p>
      </li>)}
    </ol>
    {!conversation.replies.length && <p className="text-muted-foreground">لا توجد ردود بعد. يمكنك إضافة توضيح أو استفسار.</p>}
    {enabled && canReply && !isReadOnlyPreview() ? <ReportReplyForm kind={kind} id={id} admin={admin} initialNonce={randomUUID()} /> : <p className="text-sm text-muted-foreground">{isReadOnlyPreview() ? 'المعاينة للقراءة فقط.' : !enabled ? 'الردود متوقفة مؤقتًا من الإدارة.' : 'صلاحيتك تتيح قراءة الردود فقط.'}</p>}
  </div>;
}
