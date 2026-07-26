'use server';
import { revalidatePath } from 'next/cache';
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
  // عبر sendChat: يحفظ الرسالة **ويرسل تنبيهاً فورياً (Web Push)** للمستلم — كانت
  // هذه النقطة تكتب الرسالة مباشرة بلا دفع، فلا يصل تنبيه المراسلة الخاصة.
  const { sendChat } = await import('@/lib/chat');
  await sendChat(session.uid, reciverId, message);
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
