'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';

export async function createDebateAction(formData: FormData) {
  await requireUser();
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  if (!title) redirect('/debates');
  const d = await prisma.debates.create({ data: { title, description: description || null, hide: 0 } });
  revalidatePath('/debates');
  redirect(`/debates/${toInt(d.id)}`);
}

export async function addDebateCommentAction(formData: FormData) {
  const session = await requireUser();
  const debateId = Number(formData.get('debateId'));
  const comment = String(formData.get('comment') || '').trim();
  if (!debateId || !comment) return;
  await prisma.debate_comments.create({ data: { debate_id: debateId, user_id: session.uid, comment, parent: 0 } });
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
