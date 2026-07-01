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
  revalidatePath(`/ads/${adId}`);
}
