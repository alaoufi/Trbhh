'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { scanContent } from '@/lib/content-guard';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { getPrimaryAdminId } from '@/lib/admin-inbox';

export async function submitReportAction(formData: FormData) {
  const session = await requireUser();
  if (isReadOnlyPreview()) redirect('/account/submitted-reports');
  const type = String(formData.get('type') || 'ad');
  const targetId = Number(formData.get('targetId') || 0);
  const reasonId = Number(formData.get('reasonId') || 0);
  let message = String(formData.get('message') || '').trim();
  if (!['ad', 'site', 'member', 'content'].includes(type) || !Number.isSafeInteger(targetId) || targetId < 0 || !Number.isSafeInteger(reasonId) || reasonId < 0 || message.length > 200) redirect('/report?type=site&error=invalid');
  if (type === 'ad' && (!targetId || !await prisma.ads.findUnique({ where: { id: BigInt(targetId) }, select: { id: true } }))) redirect('/report?type=site&error=invalid');
  if (type === 'member' && (!targetId || targetId === session.uid || !await prisma.users.findUnique({ where: { id: BigInt(targetId) }, select: { id: true } }))) redirect('/report?type=site&error=invalid');
  // لا تُعاقَب المُبلِّغ على الرسالة الحرة (قد يصف مخالفة حقيقية) — لكن لا تُحفظ
  // نصاً ممنوعاً بلا داعٍ؛ سبب البلاغ (reasonId) يبقى كافياً بمفرده على أي حال.
  if (message && (await scanContent(message))) message = '';

  const kind = type === 'ad' ? 'ad' : 'general';
  const adminId = await getPrimaryAdminId();
  const report = await prisma.$transaction(async tx => {
    const now = new Date();
    const row = kind === 'ad'
      ? await tx.repord_ads.create({ data: { ads_id: targetId, reason_id: reasonId, user_id: session.uid, comment: message || null, created_at: now, updated_at: now } })
      : await tx.reports.create({ data: { user_id: BigInt(session.uid), comment_id: BigInt(type === 'site' ? 0 : targetId), message: `${type === 'site' ? 'بلاغ عن الموقع' : type === 'member' ? `بلاغ عن عضو #${targetId}` : `بلاغ محتوى #${targetId}`} — ${message || 'طلب مراجعة'}`, created_at: now, updated_at: now } });
    if (adminId && adminId !== session.uid) await tx.notfications.create({ data: { user_id: String(adminId), title: 'بلاغ جديد يحتاج مراجعة ومتابعة', type: 'other', route: `/admin/reports/${kind}/${row.id}`, model_id: 0, created_at: now, updated_at: now } });
    return row;
  });
  redirect(`/account/submitted-reports/${kind}/${report.id}`);
}
