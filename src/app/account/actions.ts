'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getMemberWindows, withinWindow, getServicePricing, DUR_DAYS, DUR_LABEL, DUP_PACK_COUNT, isDur } from '@/lib/settings';
import { charge, buyDupPack } from '@/lib/wallet';
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
    const { bustAdCaches } = await import('@/lib/data');
    await bustAdCaches().catch(() => {}); // يظهر/يختفي فوراً في القوائم
  }
  revalidatePath('/account/ads');
  revalidatePath('/');
}

/** Buy a duplicate-publish package («مكرّر 3» / «مكرّر 5») for a chosen duration. */
export async function buyDupPackAction(formData: FormData) {
  const session = await requireUser();
  const tier = String(formData.get('tier') || '');
  const raw = String(formData.get('duration') || '');
  if (!isDur(raw)) redirect('/account/wallet?error=duration');
  const svc = tier === '5' ? 'dup5' : tier === '3' ? 'dup3' : null;
  if (!svc) redirect('/account/wallet');
  const price = (await getServicePricing())[svc][raw];
  if (price <= 0) redirect('/account/wallet');
  const r = await buyDupPack(session.uid, DUP_PACK_COUNT[svc], price);
  revalidatePath('/account/wallet');
  if (!r.ok) redirect(`/account/wallet?error=needcredit&price=${price}&bal=${r.balance}`);
  redirect('/account/wallet?dup=1');
}

/** Pay from wallet to feature («تمييز») one of the member's own ads for a chosen duration. */
export async function featureAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId }, select: { id: true, user_id: true, expires_at: true } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');
  const raw = String(formData.get('duration') || '');
  if (!isDur(raw)) redirect('/account/ads?error=duration');
  const fee = (await getServicePricing()).featured[raw];
  if (fee <= 0) redirect('/account/ads?featured=off'); // التمييز غير مُسعّر لهذه المدّة
  const paid = await charge(session.uid, fee, 'featured', `تمييز الإعلان #${toInt(adId)} (${DUR_LABEL[raw]})`);
  if (!paid.ok) redirect(`/account/ads?error=needcredit&price=${fee}&bal=${paid.balance}`);
  // مدّة التمييز تُضاف إلى ما تبقّى من تمييز سابق (expires_at = نهاية التمييز)
  const base = ad.expires_at && new Date(ad.expires_at).getTime() > Date.now() ? new Date(ad.expires_at) : new Date();
  const until = new Date(base.getTime() + DUR_DAYS[raw] * 86400000);
  await prisma.ads.update({ where: { id: adId }, data: { adsSpecial: 'checked', expires_at: until } });
  const { bustAdCaches } = await import('@/lib/data');
  await bustAdCaches().catch(() => {});
  revalidatePath('/account/ads');
  revalidatePath('/');
  redirect('/account/ads?featured=1');
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
