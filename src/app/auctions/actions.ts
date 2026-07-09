'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

/** فتح مزاد على إعلان العضو — رسم الفتح من التحكم يُخصم من الرصيد. */
export async function createAuctionAction(formData: FormData) {
  const session = await requireUser();
  const adId = Number(formData.get('adId') || 0);
  const startPrice = Number(formData.get('startPrice') || 0);
  const minStep = Number(formData.get('minStep') || 1);
  const days = Number(formData.get('days') || 3);
  const { createAuction } = await import('@/lib/auctions');
  const r = await createAuction(session.uid, adId, startPrice, minStep, days);
  revalidatePath('/auctions');
  if (!r.ok) {
    if (r.error === 'needcredit') redirect(`/auctions/new?ad=${adId}&error=needcredit`);
    redirect(`/auctions/new?ad=${adId}&error=${encodeURIComponent(r.error || 'err')}`);
  }
  redirect(`/auctions/${r.id}?opened=1`);
}

/** مزايدة على مزاد مفتوح. */
export async function placeBidAction(formData: FormData) {
  const session = await requireUser();
  const auctionId = Number(formData.get('auctionId') || 0);
  const amount = Number(formData.get('amount') || 0);
  const { placeBid } = await import('@/lib/auctions');
  const r = await placeBid(session.uid, auctionId, amount);
  revalidatePath(`/auctions/${auctionId}`);
  if (!r.ok) {
    if (r.error === 'low') redirect(`/auctions/${auctionId}?error=low&min=${r.min}`);
    redirect(`/auctions/${auctionId}?error=${encodeURIComponent(r.error || 'err')}`);
  }
  redirect(`/auctions/${auctionId}?bid=1`);
}
