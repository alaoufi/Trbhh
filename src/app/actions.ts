'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

/** تقييم عقار تربح بالنجوم — للأعضاء المسجّلين فقط (مرة واحدة)، مع ملاحظة اختيارية. */
export async function submitPlatformRatingAction(formData: FormData) {
  const raw = Number(formData.get('star') || 0);
  if (!Number.isInteger(raw) || raw < 1 || raw > 5) return; // لم يختر نجمة فعلياً — لا نسجّل تقييماً تخمينياً
  const star = raw;
  const session = await getSession().catch(() => null);
  if (!session) return; // التقييم للمسجّلين فقط — الزائر لا يستطيع التقييم
  // ملاحظة العضو (رأيه) — تُعرض للإدارة لتحسين المنصة، وتُنقّى من الكلمات المرفوضة
  let note = String(formData.get('note') || '').trim().slice(0, 500);
  if (note) {
    const { loadBanned, censorSync } = await import('@/lib/censor');
    await loadBanned().catch(() => {});
    note = censorSync(note);
  }
  const viewerKey = `u${session.uid}`;
  const { ensureSchema } = await import('@/data/schema-sync');
  await ensureSchema();
  // upsert: يُنشئ التقييم أول مرة، ويُحدّثه إن سبق للعضو أن قيّم (تعديل تقييمه إن أخطأ)
  await prisma.platform_reviews.upsert({
    where: { viewer_key: viewerKey },
    create: { viewer_key: viewerKey, star, user_id: session.uid, note: note || null },
    update: { star, note: note || null, user_id: session.uid },
  }).catch(() => {});
  revalidatePath('/');
}
