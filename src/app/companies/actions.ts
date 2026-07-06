'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { toggleFollow, rateStore, sendCollab, respondOffer, requestStoreTransfer, respondStoreTransfer } from '@/lib/merchant';

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
  revalidatePath('/store');
}

export async function followStoreAction(formData: FormData) {
  const session = await getSession();
  const storeId = Number(formData.get('storeId') || 0);
  if (!session) redirect('/login');
  if (storeId) await toggleFollow(session.uid, storeId);
  revalidatePath(`/companies/${storeId}`);
}

/** Transferee requests to receive ownership of a store (step 1). */
export async function requestTransferAction(formData: FormData) {
  const session = await getSession();
  const storeId = Number(formData.get('storeId') || 0);
  if (!session) redirect('/login');
  const res = storeId ? await requestStoreTransfer(session.uid, storeId) : { ok: false, msg: '' };
  redirect(`/companies/${storeId}?t=${res.ok ? 'ok' : 'err'}`);
}

/** Current owner approves/rejects a pending transfer request (step 2). */
export async function respondTransferAction(formData: FormData) {
  const session = await getSession();
  const storeId = Number(formData.get('storeId') || 0);
  const accept = String(formData.get('action')) === 'accept';
  if (!session) redirect('/login');
  if (storeId) await respondStoreTransfer(session.uid, storeId, accept);
  revalidatePath('/store');
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
