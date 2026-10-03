'use server';
import { randomUUID } from 'node:crypto';
import { redirect, unstable_rethrow } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getReportReasons } from '@/lib/report-reasons';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { getPrimaryAdminId } from '@/lib/admin-inbox';

export async function submitReportAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireUser();
  if (isReadOnlyPreview()) return { error: 'هذه معاينة للقراءة فقط، لم يُرسل البلاغ.' };
  const type = String(formData.get('type') || 'ad');
  const targetId = Number(formData.get('targetId') || 0);
  const selected = String(formData.get('reasonId') || '');
  const message = String(formData.get('message') || '').trim();
  if (!['ad', 'site', 'member', 'content'].includes(type) || !Number.isSafeInteger(targetId) || targetId < 0) return { error: 'تعذر تحديد الجهة المعنية بالبلاغ.' };
  if (!selected) return { error: 'اختر سبب البلاغ قبل الإرسال.' };
  if (message.length > 2000) return { error: 'التوضيح الإضافي يجب ألا يتجاوز 2000 حرف.' };
  if (selected === 'other' && !message) return { error: 'اكتب توضيحًا عند اختيار سبب آخر.' };
  const kind = type === 'ad' ? 'ad' : 'general';
  let reportId: bigint;
  try {
    const reason = (await getReportReasons()).find(option => option.value === selected);
    if (!reason) return { error: 'سبب البلاغ غير متاح. اختر سببًا من القائمة الحالية.' };
    if (type === 'ad' && (!targetId || !await prisma.ads.findUnique({ where: { id: BigInt(targetId) }, select: { id: true } }))) return { error: 'الإعلان غير متاح للإبلاغ.' };
    if (type === 'member' && (!targetId || targetId === session.uid || !await prisma.users.findUnique({ where: { id: BigInt(targetId) }, select: { id: true } }))) return { error: 'العضو غير متاح للإبلاغ.' };
    const adminId = await getPrimaryAdminId();
    const report = await prisma.$transaction(async tx => {
    const now = new Date();
    const summary = `السبب: ${reason.label}`;
    const row = kind === 'ad'
      ? await tx.repord_ads.create({ data: { ads_id: targetId, reason_id: reason.legacyId, user_id: session.uid, comment: summary, created_at: now, updated_at: now } })
      : await tx.reports.create({ data: { user_id: BigInt(session.uid), comment_id: BigInt(type === 'site' ? 0 : targetId), message: `${type === 'site' ? 'بلاغ عن الموقع' : type === 'member' ? `بلاغ عن عضو #${targetId}` : `بلاغ محتوى #${targetId}`} — ${summary}`, created_at: now, updated_at: now } });
    // Private evidence may quote abuse: retain it verbatim without publishing or truncation.
    if (message) await tx.report_replies.create({ data: { report_kind: kind, report_id: row.id, author_id: BigInt(session.uid), is_staff: false, body: message, nonce: randomUUID() } });
    if (adminId && adminId !== session.uid) await tx.notfications.create({ data: { user_id: String(adminId), title: 'بلاغ جديد يحتاج مراجعة ومتابعة', type: 'other', route: `/admin/reports/${kind}/${row.id}`, model_id: 0, created_at: now, updated_at: now } });
    return row;
    });
    reportId = report.id;
  } catch (error) {
    unstable_rethrow(error);
    return { error: 'تعذر إرسال البلاغ. احتفظنا بمدخلاتك؛ حاول مجددًا.' };
  }
  redirect(`/account/submitted-reports/${kind}/${reportId}`);
}
