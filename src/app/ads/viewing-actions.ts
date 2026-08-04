'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getSession, requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';
import { createViewingRequest, setViewingStatus, setViewingNote } from '@/lib/viewings';

/** طلب معاينة عقار — متاح للزائر والعضو (صفحة العقار عامّة). يصل الطلب لصاحب العقار. */
export async function requestViewingAction(formData: FormData) {
  const adId = Number(formData.get('adId')) || 0;
  if (!adId) redirect('/');
  const name = String(formData.get('name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const preferred = String(formData.get('preferred') || '').trim();
  const message = String(formData.get('message') || '').trim();
  if (!name || phone.replace(/\D/g, '').length < 8) redirect(`/ads/${adId}?vreq=missing#viewing`);

  const ad = await prisma.ads
    .findUnique({ where: { id: BigInt(adId) }, select: { user_id: true, title: true } })
    .catch(() => null);
  if (!ad) redirect('/');
  const session = await getSession();
  await createViewingRequest({
    adId,
    ownerId: toInt(ad.user_id),
    userId: session?.uid || null,
    name,
    phone,
    preferred: preferred || null,
    message: message || null,
    adTitle: ad.title || '',
  });
  redirect(`/ads/${adId}?vreq=ok#viewing`);
}

/** صاحب العقار يحدّث حالة طلب معاينة (تم التواصل/تمّت المعاينة/مغلق). */
export async function setViewingStatusAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id')) || 0;
  const status = Number(formData.get('status'));
  if (id) await setViewingStatus(id, session.uid, status);
  revalidatePath('/account/viewings');
  const back = String(formData.get('back') || '').trim();
  redirect(back.startsWith('/account/viewings') ? back : '/account/viewings');
}

/** صاحب العقار يحدّث حالة الإعلان (متاح/محجوز/مؤجر/مباع) — تظهر كشارة للزوّار. */
export async function setListingStatusAction(formData: FormData) {
  const session = await requireUser();
  const adId = Number(formData.get('adId')) || 0;
  const status = String(formData.get('status') || '').trim();
  const allowed = ['متاح', 'محجوز', 'مؤجر', 'مباع', ''];
  if (adId && allowed.includes(status)) {
    const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { user_id: true } }).catch(() => null);
    if (ad && toInt(ad.user_id) === session.uid) {
      // «متاح» أو الفراغ = الحالة الافتراضية (بلا شارة) → نخزّن null
      await prisma.ads.update({ where: { id: BigInt(adId) }, data: { re_status: status && status !== 'متاح' ? status : null } }).catch(() => {});
    }
  }
  revalidatePath(`/ads/${adId}`);
  redirect(`/ads/${adId}`);
}

/** صاحب العقار يحفظ ملاحظة CRM خاصة على الصفقة. */
export async function setViewingNoteAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id')) || 0;
  const note = String(formData.get('note') || '').trim();
  if (id) await setViewingNote(id, session.uid, note);
  revalidatePath('/account/viewings');
  const back = String(formData.get('back') || '').trim();
  redirect(back.startsWith('/account/viewings') ? back : '/account/viewings');
}
