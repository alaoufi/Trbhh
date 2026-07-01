'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function sendMessageAction(formData: FormData) {
  const session = await requireUser();
  const reciverId = Number(formData.get('reciverId'));
  const message = String(formData.get('message') || '').trim();
  if (!reciverId || !message || reciverId === session.uid) return;
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
  revalidatePath(`/messages/${reciverId}`);
}
