'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';
import { createPersonalProfile, updatePersonalProfile, deletePersonalProfile, setActiveProfileCookie, getUserProfiles } from '@/lib/profiles';
import { getSettingNum } from '@/lib/settings';

const MAX_PERSONAL_DEFAULT = 5;

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
    color: String(formData.get('color') || '').trim(),
  };
}

export async function addProfileAction(formData: FormData) {
  const session = await requireUser();
  // حدّ عدد الهويات الشخصية (يحدّده الإداري) — المتاجر لا تُحتسب هنا
  const max = await getSettingNum('max_profiles', MAX_PERSONAL_DEFAULT).catch(() => MAX_PERSONAL_DEFAULT);
  const profs = await getUserProfiles(session.uid);
  const personalCount = profs.filter((p) => p.type === 'personal').length;
  if (max > 0 && personalCount >= max) redirect('/account/profiles?error=limit&max=' + max);
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

/** تبديل الهوية الفعّالة — من المبدّل أعلى الصفحة أو صفحة الهويات. */
export async function switchProfileAction(formData: FormData) {
  const session = await requireUser();
  const profileId = Number(formData.get('profileId') || 0);
  const back = String(formData.get('back') || '/').trim() || '/';
  // تأكّد أن الهوية تخصّ المستخدم قبل تفعيلها
  const owned = await prisma.profiles.findFirst({ where: { id: BigInt(profileId), user_id: BigInt(session.uid) }, select: { id: true } }).catch(() => null);
  if (owned) await setActiveProfileCookie(profileId);
  revalidatePath('/');
  redirect(back.startsWith('/') ? back : '/');
}
