'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getMemberWindows, withinWindow } from '@/lib/settings';
import { setUserArea } from '@/lib/user-location';
import { toLocalSaudi } from '@/lib/sms';
import { respondToReport } from '@/lib/alerts';
import { setInterests } from '@/lib/interests';
import { toInt } from '@/lib/utils';

export async function respondToReportAction(formData: FormData) {
  const session = await requireUser();
  const reportId = Number(formData.get('reportId') || 0);
  const text = String(formData.get('response') || '').trim();
  if (reportId && text) await respondToReport(session.uid, reportId, text);
  revalidatePath('/account/reports');
}

export async function setInterestsAction(formData: FormData) {
  const session = await requireUser();
  const ids = formData.getAll('categoryId').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  await setInterests(session.uid, ids);
  revalidatePath('/account');
  revalidatePath('/');
}

export async function deleteAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (ad && toInt(ad.user_id) === session.uid) {
    const { deleteHours } = await getMemberWindows();
    if (!withinWindow(ad.created_at, deleteHours)) {
      redirect(`/account/ads?error=deleteWindow&hours=${deleteHours}`);
    }
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
  const phoneRaw = String(formData.get('phoneNumber') || '').trim();
  const waRaw = String(formData.get('phone_whatsapp') || '').trim();
  const phoneNumber = phoneRaw ? toLocalSaudi(phoneRaw) : phoneRaw; // canonical 05XXXXXXXX
  const phone_whatsapp = waRaw ? toLocalSaudi(waRaw) : waRaw;
  const allow_phone = formData.get('allow_phone') ? 1 : 0;
  const whatsapp = formData.get('whatsapp') ? 1 : 0;
  const cityId = Number(formData.get('city_id')) || 0; // المنطقة
  const areaId = Number(formData.get('area_id')) || 0; // المدينة / المحافظة
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: { name, phoneNumber, phone_whatsapp, allow_phone, whatsapp, ...(cityId ? { city_id: BigInt(cityId) } : {}) },
  });
  await setUserArea(session.uid, areaId || null);
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
