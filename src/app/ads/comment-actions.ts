'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { checkFlood, bumpDupAttempts, banUserFor, notifyModBlock, logMod, DUP_LIMIT } from '@/lib/moderation';
import { getDupThresholds, getStrikeBanDays } from '@/lib/settings';
import { normalizeAr, similarity } from '@/domain/text';

export async function addCommentAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const rawComment = String(formData.get('comment') || '').trim();
  const parentId = Number(formData.get('parentId') || 0);
  if (!rawComment) return;
  // حماية المحتوى: حارس المحتوى يمنع (بعقوباته) والكلمات المرفوضة تُحجب
  const { screenChatMessage } = await import('@/lib/chat');
  const st = await screenChatMessage(session.uid, rawComment);
  if (!st.ok) redirect(`/ads/${Number(adId)}?cblocked=1`);
  const comment = st.text;

  // حاجز إغراق صلب — لم يكن مفعّلاً هنا سابقاً
  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect(`/ads/${Number(adId)}?cflood=1`);

  // تكرار: نفس نص التعليق مكرّر من نفس العضو (بأي إعلان) — لم يكن له أي كشف
  // تكرار إطلاقاً سابقاً؛ نفس نظام الإنذار المستخدم في الإعلانات (3 محاولات = حظر).
  const { detail: detailPct } = await getDupThresholds();
  const mine = await prisma.comments.findMany({ where: { sender_id: BigInt(session.uid) }, select: { comment: true }, orderBy: { id: 'desc' }, take: 20 });
  const nText = normalizeAr(comment);
  const dup = mine.some((r) => similarity(nText, normalizeAr(r.comment)) * 100 >= detailPct);
  if (dup) {
    const n = await bumpDupAttempts(session.uid);
    await logMod(session.uid, { kind: 'duplicate', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `تعليق مكرّر — إعلان #${Number(adId)}`, adId: Number(adId) });
    if (n >= DUP_LIMIT) {
      await banUserFor(session.uid, await getStrikeBanDays(), 'auto', 'تكرار نشر نفس التعليق');
      await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار نشر نفس التعليق.');
      redirect(`/ads/${Number(adId)}?cbanned=1`);
    }
    redirect(`/ads/${Number(adId)}?cdup=1`);
  }
  // هوية النشر الفعّالة: يُنسب التعليق إليها (يُعرض باسمها)
  const { getActiveProfile } = await import('@/lib/profiles');
  const active = await getActiveProfile(session.uid).catch(() => null);
  await prisma.comments.create({
    data: {
      ads_id: adId,
      sender_id: BigInt(session.uid),
      comment,
      report: 'no',
      active: 'yes',
      hide: 'no',
      parent_id: parentId,
      profile_id: active && active.type === 'personal' ? BigInt(active.id) : null,
    },
  });
  // تنبيه صاحب الإعلان (إلا إن علّق على إعلانه) — جرس + دفع فوري
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { user_id: true } });
  if (ad && Number(ad.user_id) !== session.uid) {
    const { notify } = await import('@/lib/notify');
    await notify(Number(ad.user_id), { title: `تعليق جديد على إعلانك من ${session.name}`, route: `/ads/${adId}`, type: 'comment', body: comment.slice(0, 120) });
  }
  revalidatePath(`/ads/${adId}`);
}
