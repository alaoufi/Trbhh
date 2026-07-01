'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function submitReportAction(formData: FormData) {
  const session = await requireUser();
  const type = String(formData.get('type') || 'ad');
  const targetId = Number(formData.get('targetId') || 0);
  const reasonId = Number(formData.get('reasonId') || 0);
  const message = String(formData.get('message') || '').trim();

  if (type === 'ad' && targetId) {
    await prisma.repord_ads.create({ data: { ads_id: targetId, reason_id: reasonId, user_id: session.uid, comment: message || null } });
  } else {
    await prisma.reports.create({ data: { user_id: BigInt(session.uid), comment_id: BigInt(targetId), message: message || 'بلاغ' } });
  }
  redirect(targetId && type === 'ad' ? `/ads/${targetId}?reported=1` : '/');
}
