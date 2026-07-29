'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';
import { adReviewsEnabled } from '@/lib/ad-reviews';

const clampStar = (v: FormDataEntryValue | null): number => {
  const n = Math.round(Number(v) || 0);
  return n >= 1 && n <= 5 ? n : 0;
};

/** إضافة/تعديل تقييم العميل لإعلان (تجربته مع المنتج وصاحبه) عبر معايير متعدّدة + رأي مكتوب. */
export async function addAdReviewAction(formData: FormData) {
  const session = await requireUser();
  const adId = Number(formData.get('adId') || 0);
  if (!adId) redirect('/');
  if (!(await adReviewsEnabled())) redirect(`/ads/${adId}`);

  const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { user_id: true } }).catch(() => null);
  if (!ad) redirect('/');
  // لا يقيّم صاحب الإعلان إعلانه
  if (toInt(ad.user_id) === session.uid) redirect(`/ads/${adId}?rerror=own#reviews`);

  const star = clampStar(formData.get('star'));
  if (!star) redirect(`/ads/${adId}?rerror=star#reviews`);
  const star_match = clampStar(formData.get('star_match')) || null;
  const star_trust = clampStar(formData.get('star_trust')) || null;
  const star_quality = clampStar(formData.get('star_quality')) || null;
  const star_comm = clampStar(formData.get('star_comm')) || null;
  const recRaw = String(formData.get('recommend') || '');
  const recommend = recRaw === '1' ? 1 : recRaw === '0' ? 0 : null;
  const verified_deal = String(formData.get('verified') || '') === '1' ? 1 : null;
  const comment = String(formData.get('comment') || '').trim().slice(0, 1000) || null;

  // هوية النشر الفعّالة (يُعرض التقييم باسمها كالتعليقات)
  const profileId = await import('@/lib/profiles').then((m) => m.getActiveProfile(session.uid)).then((p) => (p.id ? BigInt(p.id) : null)).catch(() => null);

  const existing = await prisma.review_ads.findFirst({ where: { ads_id: BigInt(adId), sender_id: BigInt(session.uid) }, select: { id: true } }).catch(() => null);
  const data = { star, star_match, star_trust, star_quality, star_comm, recommend, verified_deal, comment, profile_id: profileId };
  if (existing) {
    await prisma.review_ads.update({ where: { id: existing.id }, data: { ...data, updated_at: new Date() } }).catch(() => {});
  } else {
    await prisma.review_ads.create({ data: { ...data, ads_id: BigInt(adId), sender_id: BigInt(session.uid), created_at: new Date() } }).catch(() => {});
  }
  revalidatePath(`/ads/${adId}`);
  redirect(`/ads/${adId}?rated=1#reviews`);
}
