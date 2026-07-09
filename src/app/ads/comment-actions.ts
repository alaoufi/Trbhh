'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function addCommentAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const comment = String(formData.get('comment') || '').trim();
  const parentId = Number(formData.get('parentId') || 0);
  if (!comment) return;
  await prisma.comments.create({
    data: {
      ads_id: adId,
      sender_id: BigInt(session.uid),
      comment,
      report: 'no',
      active: 'yes',
      hide: 'no',
      parent_id: parentId,
    },
  });
  // notify the ad owner (unless commenting on own ad)
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { user_id: true } });
  if (ad && Number(ad.user_id) !== session.uid) {
    {
    // منع تكرار نفس التنبيه بنفس اليوم
    const nDup = await prisma.notfications.findFirst({ where: { user_id: String(Number(ad.user_id)), title: `تعليق جديد على إعلانك من ${session.name}`, created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } }).catch(() => null);
    if (!nDup) await prisma.notfications.create({ data: { title: `تعليق جديد على إعلانك من ${session.name}`, route: `/ads/${adId}`, user_id: String(Number(ad.user_id)), type: 'comment' } }).catch(() => {});
  }
  }
  revalidatePath(`/ads/${adId}`);
}
