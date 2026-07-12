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

/** مراسلة صاحب المتجر من صفحة متجره: تصل رسالته في «الرسائل» ويرد منها،
 *  ويظهر للتاجر تنبيه بالرسائل الجديدة فور فتح لوحة متجره. */
export async function messageStoreOwnerAction(formData: FormData) {
  const session = await getSession();
  const storeId = Number(formData.get('storeId') || 0);
  if (!session) redirect(`/login?next=${encodeURIComponent(`/companies/${storeId}`)}`);
  const raw = String(formData.get('message') || '').trim();
  if (!storeId || !raw) redirect(`/companies/${storeId || ''}`);
  const { prisma } = await import('@/lib/prisma');
  const store = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { user_id: true, store_name: true } }).catch(() => null);
  if (!store || store.user_id === session.uid) redirect(`/companies/${storeId}`);
  // حماية المراسلات: حارس المحتوى والكلمات المرفوضة (نفس حماية الرسائل)
  const { screenChatMessage } = await import('@/lib/chat');
  const screened = await screenChatMessage(session.uid, `بخصوص متجر «${store.store_name || 'متجركم'}»: ${raw.slice(0, 1500)}`);
  if (!screened.ok) redirect(`/companies/${storeId}?msgsent=blocked`);
  await prisma.chats.create({
    data: { sender_id: session.uid, reciver_id: store.user_id, message: screened.text, is_read: 0, chat_id: 0, type_from_user: 'user', type_to_user: 'user' },
  }).catch(() => {});
  const nDup = await prisma.notfications.findFirst({ where: { user_id: String(store.user_id), title: `رسالة جديدة من ${session.name}`, created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } }).catch(() => null);
  if (!nDup) await prisma.notfications.create({ data: { title: `رسالة جديدة من ${session.name}`, route: `/messages/${session.uid}`, user_id: String(store.user_id), type: 'message' } }).catch(() => {});
  redirect(`/companies/${storeId}?msgsent=1`);
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
