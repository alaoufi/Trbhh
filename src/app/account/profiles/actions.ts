'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';
import { createPersonalProfile, updatePersonalProfile, deletePersonalProfile, setActiveProfileCookie, getUserProfiles, PROFILES_INTRO_COOKIE } from '@/lib/profiles';
import { getSettingNum } from '@/lib/settings';

const MAX_PERSONAL_DEFAULT = 5;

/** إخفاء رسالة الشرح التعريفية (تُعرض أول مرة فقط). */
export async function dismissProfilesIntroAction() {
  await requireUser();
  (await cookies()).set(PROFILES_INTRO_COOKIE, '1', { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect('/account/profiles');
}

/** حفظ صورة تعريفية مرفوعة → معرّف upload، أو 0. يوحّد الصيغة (HEIC→JPEG). */
async function saveAvatar(formData: FormData, userId: number): Promise<number> {
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0 || file.size > 30 * 1024 * 1024) return 0;
  try {
    const srcExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const [{ normalizeUpload }, { saveUpload }] = await Promise.all([import('@/lib/upload-normalize'), import('@/lib/storage')]);
    const norm = await normalizeUpload(Buffer.from(await file.arrayBuffer()), srcExt);
    const rel = await saveUpload(norm.buf, `profile_${userId}_${Date.now()}.${norm.ext}`);
    const up = await prisma.uploads.create({ data: { file_name: rel, extension: norm.ext, type: 'profile', file_size: norm.buf.length, user_id: userId } });
    return toInt(up.id);
  } catch {
    return 0;
  }
}

function fields(formData: FormData) {
  return {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    whatsapp: String(formData.get('whatsapp') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    handle: String(formData.get('handle') || '').trim(),
    theme: String(formData.get('theme') || '').trim(),
  };
}

export async function addProfileAction(formData: FormData) {
  const session = await requireUser();
  // الحد = الأصغر بين حدّ الإدارة الصلب (max_profiles) وعدد حسابات الباقة/الإعفاء الساري
  const hardMax = await getSettingNum('max_profiles', MAX_PERSONAL_DEFAULT).catch(() => MAX_PERSONAL_DEFAULT);
  const { getMemberIdentitySub } = await import('@/lib/identity-plans');
  const sub = await getMemberIdentitySub(session.uid);
  const profs = await getUserProfiles(session.uid);
  const extraCount = profs.filter((p) => p.type === 'personal' && !p.isDefault).length; // عدا الرئيسية المجانية
  const limit = hardMax > 0 ? Math.min(hardMax, sub.slots) : sub.slots;
  if (extraCount >= limit) {
    if (sub.featurePaid && !sub.active) redirect('/account/profiles?error=needsub#packages');
    redirect('/account/profiles?error=limit&max=' + limit + '#packages');
  }
  const avatar = await saveAvatar(formData, session.uid);
  const r = await createPersonalProfile(session.uid, { ...fields(formData), avatar });
  if (!r.ok) redirect(`/account/profiles?error=${r.error}`);
  revalidatePath('/account/profiles');
  redirect('/account/profiles?added=1');
}

export async function updateProfileAction(formData: FormData) {
  const session = await requireUser();
  const profileId = Number(formData.get('profileId') || 0);
  const avatar = await saveAvatar(formData, session.uid);
  const r = await updatePersonalProfile(session.uid, profileId, { ...fields(formData), avatar });
  if (!r.ok) redirect(`/account/profiles?error=${r.error}`);
  revalidatePath('/account/profiles');
  revalidatePath('/');
  redirect('/account/profiles?saved=1');
}

export async function deleteProfileAction(formData: FormData) {
  const session = await requireUser();
  const profileId = Number(formData.get('profileId') || 0);
  await deletePersonalProfile(session.uid, profileId);
  revalidatePath('/account/profiles');
  redirect('/account/profiles?deleted=1');
}

/** اشتراك/تجديد بباقة هويات لمدّة (شهري/نصف سنوي/سنوي) — خصم من المحفظة. */
export async function subscribeIdentityAction(formData: FormData) {
  const session = await requireUser();
  const idx = Number(formData.get('plan') || 0);
  const durRaw = String(formData.get('dur') || 'month');
  const dur = (['month', 'half', 'year'].includes(durRaw) ? durRaw : 'month') as 'month' | 'half' | 'year';
  const { subscribeIdentityPlan } = await import('@/lib/identity-plans');
  const r = await subscribeIdentityPlan(session.uid, idx, dur);
  if (!r.ok) {
    if (r.error === 'nocredit') redirect(`/account/profiles?iderror=nocredit&price=${r.price || 0}&bal=${r.balance || 0}#packages`);
    redirect(`/account/profiles?iderror=${r.error || 'fail'}#packages`);
  }
  revalidatePath('/account/profiles');
  revalidatePath('/');
  redirect('/account/profiles?idsubbed=1#packages');
}

/** توثيق الحساب الرئيسي — إرسال رمز إلى جوال العضو الحالي. */
export async function startPrimaryVerifyAction() {
  const session = await requireUser();
  const u = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true } }).catch(() => null);
  if (!u?.phoneNumber) redirect('/account/profiles?perror=nophone#main');
  const { createAndSendOtp } = await import('@/lib/sms');
  const sent = await createAndSendOtp(u.phoneNumber);
  if (!sent.ok) redirect(`/account/profiles?perror=otp&omsg=${encodeURIComponent(sent.error || '')}#main`);
  redirect('/account/profiles?potp=1#main');
}

/** توثيق الحساب الرئيسي — تأكيد الرمز. */
export async function confirmPrimaryVerifyAction(formData: FormData) {
  const session = await requireUser();
  const code = String(formData.get('code') || '').trim();
  const u = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true } }).catch(() => null);
  if (!u?.phoneNumber) redirect('/account/profiles?perror=nophone#main');
  const { verifyOtp } = await import('@/lib/sms');
  if (!(await verifyOtp(u.phoneNumber, code))) redirect('/account/profiles?perror=badcode&potp=1#main');
  await prisma.users.update({ where: { id: BigInt(session.uid) }, data: { primary_verified: 1 } }).catch(() => {});
  revalidatePath('/account/profiles');
  redirect('/account/profiles?pverified=1#main');
}

/** الخطوة ١ (رمز التحقق): إرسال رمز SMS إلى رقم الحساب الآخر لإثبات ملكيته قبل ربطه. */
export async function startLinkOtpAction(formData: FormData) {
  const session = await requireUser();
  const identifier = String(formData.get('identifier') || '').trim();
  if (!identifier) redirect('/account/profiles?merror=creds#merge');
  const { findMergeableAccount, maskPhone } = await import('@/lib/account-merge');
  const r = await findMergeableAccount(identifier, session.uid);
  if (!r.ok) redirect(`/account/profiles?merror=${r.error}#merge`);
  if (!r.phone) redirect('/account/profiles?merror=nophone#merge'); // لا جوال → استخدم كلمة المرور
  const { createAndSendOtp } = await import('@/lib/sms');
  const sent = await createAndSendOtp(r.phone);
  if (!sent.ok) redirect(`/account/profiles?merror=otp&omsg=${encodeURIComponent(sent.error || '')}#merge`);
  redirect(`/account/profiles?motp=1&mident=${encodeURIComponent(identifier)}&mmask=${encodeURIComponent(maskPhone(r.phone))}#merge`);
}

/** الخطوة ٢ (رمز التحقق): التأكد من الرمز ثم ربط الحساب (يبقى مستقلاً — للتبديل فقط). */
export async function confirmLinkOtpAction(formData: FormData) {
  const session = await requireUser();
  const identifier = String(formData.get('identifier') || '').trim();
  const code = String(formData.get('code') || '').trim();
  if (!identifier || !code) redirect('/account/profiles?merror=creds#merge');
  const { findMergeableAccount } = await import('@/lib/account-merge');
  const r = await findMergeableAccount(identifier, session.uid);
  if (!r.ok || !r.phone || !r.uid) redirect(`/account/profiles?merror=${r.error || 'fail'}#merge`);
  const { verifyOtp } = await import('@/lib/sms');
  if (!(await verifyOtp(r.phone, code))) redirect(`/account/profiles?merror=badcode&motp=1&mident=${encodeURIComponent(identifier)}#merge`);
  const { linkVerifiedAccount } = await import('@/lib/account-links');
  const res = await linkVerifiedAccount(session.uid, r.uid);
  if (!res.ok) redirect(`/account/profiles?merror=${res.error || 'fail'}#merge`);
  revalidatePath('/account/profiles');
  revalidatePath('/');
  redirect(`/account/profiles?linked=1&lname=${encodeURIComponent(res.name || '')}`);
}

/** ربط ذاتي (بديل): ربط حساب آخر للعضو بعد التحقق من كلمة مروره. */
export async function linkAccountAction(formData: FormData) {
  const session = await requireUser();
  const identifier = String(formData.get('identifier') || '').trim();
  const password = String(formData.get('password') || '');
  if (!identifier || !password) redirect('/account/profiles?merror=creds#merge');
  const { verifyAndLinkOwn } = await import('@/lib/account-links');
  const res = await verifyAndLinkOwn(session.uid, identifier, password);
  if (!res.ok) redirect(`/account/profiles?merror=verify&omsg=${encodeURIComponent(res.error || '')}#merge`);
  revalidatePath('/account/profiles');
  revalidatePath('/');
  redirect(`/account/profiles?linked=1&lname=${encodeURIComponent(res.name || '')}`);
}

/** تبديل الهوية الفعّالة — من المبدّل أعلى الصفحة أو صفحة الهويات. */
export async function switchProfileAction(formData: FormData) {
  const session = await requireUser();
  const profileId = Number(formData.get('profileId') || 0);
  const back = String(formData.get('back') || '/').trim() || '/';
  // تأكّد أن الهوية تخصّ المستخدم قبل تفعيلها، وطبّق قالبها على الموقع
  const owned = await prisma.profiles.findFirst({ where: { id: BigInt(profileId), user_id: BigInt(session.uid) }, select: { id: true, theme: true } }).catch(() => null);
  if (owned) {
    await setActiveProfileCookie(profileId);
    const { setThemeCookie } = await import('@/lib/profiles');
    await setThemeCookie(owned.theme);
  }
  revalidatePath('/', 'layout');
  redirect(back.startsWith('/') ? back : '/');
}
