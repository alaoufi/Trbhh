'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';

export async function deleteAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (ad && toInt(ad.user_id) === session.uid) {
    await prisma.photos.deleteMany({ where: { other_id: adId } });
    await prisma.ads.delete({ where: { id: adId } });
  }
  revalidatePath('/account/ads');
}

export async function toggleAdStatusAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (ad && toInt(ad.user_id) === session.uid) {
    await prisma.ads.update({ where: { id: adId }, data: { status: ad.status === 1 ? 0 : 1 } });
  }
  revalidatePath('/account/ads');
}

export async function updateProfileAction(_prev: unknown, formData: FormData) {
  const session = await requireUser();
  const name = String(formData.get('name') || '').trim();
  const phoneNumber = String(formData.get('phoneNumber') || '').trim();
  const phone_whatsapp = String(formData.get('phone_whatsapp') || '').trim();
  const allow_phone = formData.get('allow_phone') ? 1 : 0;
  const whatsapp = formData.get('whatsapp') ? 1 : 0;
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: { name, phoneNumber, phone_whatsapp, allow_phone, whatsapp },
  });
  revalidatePath('/account/profile');
  return { ok: true };
}

export async function toggleFavoriteAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const existing = await prisma.favorites.findFirst({ where: { user_id: BigInt(session.uid), ads_id: adId } });
  if (existing) await prisma.favorites.delete({ where: { id: existing.id } });
  else await prisma.favorites.create({ data: { user_id: BigInt(session.uid), ads_id: adId } });
  revalidatePath(`/ads/${toInt(adId)}`);
  revalidatePath('/account/favorites');
}
