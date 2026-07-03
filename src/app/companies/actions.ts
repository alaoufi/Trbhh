'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { toggleFollow, rateStore, sendCollab, respondOffer } from '@/lib/merchant';

export async function sendCollabAction(formData: FormData) {
  const session = await getSession();
  const toStore = Number(formData.get('toStore') || 0);
  if (!session) redirect('/login');
  if (toStore) await sendCollab(session.uid, toStore);
  revalidatePath(`/companies/${toStore}`);
}

export async function respondOfferAction(formData: FormData) {
  const session = await getSession();
  const offerId = Number(formData.get('offerId') || 0);
  const accept = String(formData.get('action')) === 'accept';
  if (!session) redirect('/login');
  if (offerId) await respondOffer(session.uid, offerId, accept);
  revalidatePath('/account/company');
}

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
