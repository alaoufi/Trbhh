'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function submitReviewAction(formData: FormData) {
  const session = await requireUser();
  const reciverId = Number(formData.get('reciverId'));
  const star = Math.min(5, Math.max(1, Number(formData.get('star') || 0)));
  const review = String(formData.get('review') || '').trim();
  if (!reciverId || reciverId === session.uid || !star) return;
  const existing = await prisma.reviews.findFirst({ where: { reciver_id: BigInt(reciverId), sender_id: BigInt(session.uid) } });
  if (existing) return;
  await prisma.reviews.create({ data: { reciver_id: BigInt(reciverId), sender_id: BigInt(session.uid), star, review: review || '', report: 'no' } });
  // notify the reviewed user
  {
    // منع تكرار نفس التنبيه بنفس اليوم
    const nDup = await prisma.notfications.findFirst({ where: { user_id: String(reciverId), title: 'تقييم جديد على حسابك', created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } }).catch(() => null);
    if (!nDup) await prisma.notfications.create({ data: { title: 'تقييم جديد على حسابك', route: `/users/${reciverId}`, user_id: String(reciverId), type: 'review' } }).catch(() => {});
  }
  revalidatePath(`/users/${reciverId}`);
}
