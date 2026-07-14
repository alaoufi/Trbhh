'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function sendMessageAction(formData: FormData) {
  const session = await requireUser();
  const reciverId = Number(formData.get('reciverId'));
  const rawMessage = String(formData.get('message') || '').trim();
  if (!reciverId || !rawMessage || reciverId === session.uid) return;
  // حظر عضو: لا تُرسَل الرسالة إن حظر أحد الطرفين الآخر
  const { blockedBetween } = await import('@/lib/blocks');
  if (await blockedBetween(session.uid, reciverId)) return;
  // حماية المراسلات: حارس المحتوى والكلمات المرفوضة
  const { screenChatMessage } = await import('@/lib/chat');
  const screened = await screenChatMessage(session.uid, rawMessage);
  if (!screened.ok) return;
  const message = screened.text;
  await prisma.chats.create({
    data: {
      sender_id: session.uid,
      reciver_id: reciverId,
      message,
      is_read: 0,
      chat_id: 0,
      type_from_user: 'user',
      type_to_user: 'user',
    },
  });
  {
    // منع تكرار نفس التنبيه بنفس اليوم
    const nDup = await prisma.notfications.findFirst({ where: { user_id: String(reciverId), title: `رسالة جديدة من ${session.name}`, created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } }).catch(() => null);
    if (!nDup) await prisma.notfications.create({ data: { title: `رسالة جديدة من ${session.name}`, route: `/messages/${session.uid}`, user_id: String(reciverId), type: 'message' } }).catch(() => {});
  }
  revalidatePath(`/messages/${reciverId}`);
}

/** حظر عضو — يمنع المراسلة بين الطرفين. */
export async function blockUserAction(formData: FormData) {
  const session = await requireUser();
  const target = Number(formData.get('userId') || 0);
  if (target && target !== session.uid) {
    const { blockUser } = await import('@/lib/blocks');
    await blockUser(session.uid, target);
  }
  revalidatePath(`/users/${target}`);
  revalidatePath(`/messages/${target}`);
}

/** رفع الحظر عن عضو. */
export async function unblockUserAction(formData: FormData) {
  const session = await requireUser();
  const target = Number(formData.get('userId') || 0);
  if (target) {
    const { unblockUser } = await import('@/lib/blocks');
    await unblockUser(session.uid, target);
  }
  revalidatePath(`/users/${target}`);
  revalidatePath(`/messages/${target}`);
}
