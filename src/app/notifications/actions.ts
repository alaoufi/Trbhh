'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

/** فتح تنبيه: يُعلَّم مقروءاً (ينتقل للأرشيف) ثم يُفتح رابطه. */
export async function openNotifAction(formData: FormData) {
  const session = await requireUser();
  const id = BigInt(String(formData.get('id') || '0'));
  const row = await prisma.notfications.findFirst({ where: { id, user_id: String(session.uid) } }).catch(() => null);
  if (!row) redirect('/notifications');
  if (!row.read_at) await prisma.notfications.updateMany({ where: { id }, data: { read_at: new Date() } }).catch(() => {});
  redirect(row.route || '/notifications');
}

/** نقل كل الجديد إلى الأرشيف (تعليم الكل مقروءاً). */
export async function archiveAllNotifsAction() {
  const session = await requireUser();
  await prisma.notfications.updateMany({ where: { user_id: String(session.uid), read_at: null }, data: { read_at: new Date() } }).catch(() => {});
  revalidatePath('/notifications');
  redirect('/notifications');
}
