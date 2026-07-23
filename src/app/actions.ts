'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

/** تقييم منصة تربح بالنجوم — عضو أو زائر (عبر كوكي trbhh_vid الدائم)، مرة واحدة لكل منهما. */
export async function submitPlatformRatingAction(formData: FormData) {
  const raw = Number(formData.get('star') || 0);
  if (!Number.isInteger(raw) || raw < 1 || raw > 5) return; // لم يختر نجمة فعلياً — لا نسجّل تقييماً تخمينياً
  const star = raw;
  const session = await getSession().catch(() => null);
  const vid = (await cookies()).get('trbhh_vid')?.value;
  const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
  if (!viewerKey) return;
  const { ensureSchema } = await import('@/data/schema-sync');
  await ensureSchema();
  // فشل صامت لو سبق أن قيّم (viewer_key فريد) — لا تكرار
  await prisma.platform_reviews.create({ data: { viewer_key: viewerKey, star } }).catch(() => {});
  revalidatePath('/');
}
