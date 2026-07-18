'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';
import { checkFlood, bumpDupAttempts, banUserFor, notifyModBlock, logMod, DUP_LIMIT } from '@/lib/moderation';
import { getDupThresholds, getStrikeBanDays } from '@/lib/settings';
import { normalizeAr, similarity } from '@/domain/text';

export async function createDebateAction(formData: FormData) {
  const session = await requireUser();
  const rawTitle = String(formData.get('title') || '').trim();
  const rawDesc = String(formData.get('description') || '').trim();
  if (!rawTitle) redirect('/debates');
  // حماية المحتوى: حارس المحتوى يمنع (بعقوباته) والكلمات المرفوضة تُحجب
  const { screenChatMessage } = await import('@/lib/chat');
  const st = await screenChatMessage(session.uid, `${rawTitle} ${rawDesc}`.trim());
  if (!st.ok) redirect('/debates?error=blocked');

  // حاجز إغراق صلب — لم يكن مفعّلاً هنا سابقاً (سطح عام بلا أي حدّ نشر)
  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect('/debates?error=flood');

  // تكرار: نفس العضو يطرح موضوعاً مطابقاً لموضوع سابق له — نفس نظام الإنذار
  // المستخدم في الإعلانات (3 محاولات = حظر)، لم يكن له أي كشف تكرار إطلاقاً سابقاً.
  const { title: titlePct } = await getDupThresholds();
  const mine = await prisma.debates.findMany({ where: { user_id: session.uid }, select: { id: true, title: true }, orderBy: { id: 'desc' }, take: 50 });
  const nTitle = normalizeAr(rawTitle);
  const dupHit = mine.find((r) => similarity(nTitle, normalizeAr(r.title)) * 100 >= titlePct);
  if (dupHit) {
    const n = await bumpDupAttempts(session.uid);
    await logMod(session.uid, { kind: 'duplicate', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `موضوع نقاش مكرّر مع #${toInt(dupHit.id)} — الجديد: ${rawTitle.slice(0, 60)}` });
    if (n >= DUP_LIMIT) {
      await banUserFor(session.uid, await getStrikeBanDays());
      await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار طرح مواضيع نقاش مطابقة.');
      redirect('/debates?error=banned');
    }
    redirect('/debates?error=duplicate');
  }

  const { loadBanned, censorSync } = await import('@/lib/censor');
  await loadBanned().catch(() => {});
  const d = await prisma.debates.create({ data: { title: censorSync(rawTitle), description: rawDesc ? censorSync(rawDesc) : null, hide: 0, user_id: session.uid } });
  revalidatePath('/debates');
  redirect(`/debates/${toInt(d.id)}`);
}

export async function addDebateCommentAction(formData: FormData) {
  const session = await requireUser();
  const debateId = Number(formData.get('debateId'));
  const raw = String(formData.get('comment') || '').trim();
  if (!debateId || !raw) return;
  // حماية المحتوى: منع المخالف وحجب الكلمات المرفوضة
  const { screenChatMessage } = await import('@/lib/chat');
  const st = await screenChatMessage(session.uid, raw);
  if (!st.ok) redirect(`/debates/${debateId}?error=blocked`);

  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect(`/debates/${debateId}?error=flood`);

  // تكرار: نفس نص التعليق مكرّر من نفس العضو (بأي نقاش) — نفس نظام الإنذار
  const { detail: detailPct } = await getDupThresholds();
  const mine = await prisma.debate_comments.findMany({ where: { user_id: session.uid }, select: { comment: true }, orderBy: { id: 'desc' }, take: 20 });
  const nText = normalizeAr(raw);
  const dup = mine.some((r) => similarity(nText, normalizeAr(r.comment)) * 100 >= detailPct);
  if (dup) {
    const n = await bumpDupAttempts(session.uid);
    await logMod(session.uid, { kind: 'duplicate', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `تعليق نقاش مكرّر — نقاش #${debateId}` });
    if (n >= DUP_LIMIT) {
      await banUserFor(session.uid, await getStrikeBanDays());
      await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار نشر نفس التعليق.');
      redirect(`/debates/${debateId}?error=banned`);
    }
    redirect(`/debates/${debateId}?error=duplicate`);
  }

  await prisma.debate_comments.create({ data: { debate_id: debateId, user_id: session.uid, comment: st.text, parent: 0 } });
  revalidatePath(`/debates/${debateId}`);
}

export async function toggleDebateLikeAction(formData: FormData) {
  const session = await requireUser();
  const debateId = Number(formData.get('debateId'));
  const existing = await prisma.debate_likes.findFirst({ where: { debate_id: debateId, user_id: session.uid } });
  if (existing) await prisma.debate_likes.update({ where: { id: existing.id }, data: { like: existing.like === 1 ? 0 : 1 } });
  else await prisma.debate_likes.create({ data: { debate_id: debateId, user_id: session.uid, like: 1 } });
  revalidatePath(`/debates/${debateId}`);
}
