'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';

export async function createDebateAction(formData: FormData) {
  const session = await requireUser();
  const rawTitle = String(formData.get('title') || '').trim();
  const rawDesc = String(formData.get('description') || '').trim();
  if (!rawTitle) redirect('/debates');
  // حماية المحتوى: حارس المحتوى يمنع (بعقوباته) والكلمات المرفوضة تُحجب
  const { screenChatMessage } = await import('@/lib/chat');
  const st = await screenChatMessage(session.uid, `${rawTitle} ${rawDesc}`.trim());
  if (!st.ok) redirect('/debates?error=blocked');
  const { loadBanned, censorSync } = await import('@/lib/censor');
  await loadBanned().catch(() => {});
  const d = await prisma.debates.create({ data: { title: censorSync(rawTitle), description: rawDesc ? censorSync(rawDesc) : null, hide: 0 } });
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
