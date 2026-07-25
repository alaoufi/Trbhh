'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { scanContent } from '@/lib/content-guard';
import { handleProhibited } from '@/lib/moderation';
import { censor } from '@/lib/censor';

export async function submitReviewAction(formData: FormData) {
  const session = await requireUser();
  const reciverId = Number(formData.get('reciverId'));
  const star = Math.min(5, Math.max(1, Number(formData.get('star') || 0)));
  const review = String(formData.get('review') || '').trim();
  if (!reciverId || reciverId === session.uid || !star) return;
  const existing = await prisma.reviews.findFirst({ where: { reciver_id: BigInt(reciverId), sender_id: BigInt(session.uid) } });
  if (existing) return;
  // حماية المحتوى: حارس المحتوى يمنع (بعقوباته) والكلمات المرفوضة تُحجب — نفس معيار التعليقات والمراسلات
  if (review) {
    const badContent = await scanContent(review);
    if (badContent) {
      const o = await handleProhibited(session.uid, badContent.category, badContent.term, review.slice(0, 200));
      redirect(`/users/${reciverId}?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : ''}`);
    }
  }
  const censored = review ? await censor(review) : '';
  const { getActiveProfile } = await import('@/lib/profiles');
  const active = await getActiveProfile(session.uid).catch(() => null);
  await prisma.reviews.create({ data: { reciver_id: BigInt(reciverId), sender_id: BigInt(session.uid), star, review: censored, report: 'no', profile_id: active && active.type === 'personal' ? BigInt(active.id) : null } });
  // notify the reviewed user
  {
    // منع تكرار نفس التنبيه بنفس اليوم
    const nDup = await prisma.notfications.findFirst({ where: { user_id: String(reciverId), title: 'تقييم جديد على حسابك', created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } }).catch(() => null);
    if (!nDup) await prisma.notfications.create({ data: { title: 'تقييم جديد على حسابك', route: `/users/${reciverId}`, user_id: String(reciverId), type: 'review' } }).catch(() => {});
  }
  revalidatePath(`/users/${reciverId}`);
}
