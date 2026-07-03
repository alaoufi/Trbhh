'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { toggleFollow, rateStore } from '@/lib/merchant';

export async function followStoreAction(formData: FormData) {
  const session = await getSession();
  const storeId = Number(formData.get('storeId') || 0);
  if (!session) redirect('/login');
  if (storeId) await toggleFollow(session.uid, storeId);
  revalidatePath(`/companies/${storeId}`);
}

export async function rateStoreAction(formData: FormData) {
  const session = await getSession();
  const storeId = Number(formData.get('storeId') || 0);
  const star = Number(formData.get('star') || 5);
  const note = String(formData.get('note') || '').trim();
  if (!session) redirect('/login');
  if (storeId) await rateStore(session.uid, storeId, star, note);
  revalidatePath(`/companies/${storeId}`);
}
