'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAction, setUserPerms, applyRolePreset, ALL_KEYS, setRolePermKeys, MATRIX_ROLES, type Role } from '@/lib/roles';
import { findDuplicateAds } from '@/lib/duplicates';
import { deleteClassified } from '@/lib/classified';
import { addBannedWord, deleteBannedWord } from '@/lib/censor';
import { addGuardWord, deleteGuardWord, GUARD_CATEGORIES, type GuardCategory } from '@/lib/content-guard';
import { createPackage, updatePackage, deletePackage, assignUserPackage, type Tier } from '@/lib/packages';
import { setSetting, SETTING_AD_EDIT_HOURS, SETTING_AD_DELETE_HOURS, SETTING_HOME_STATS, HOME_STAT_KEYS, SETTING_CLASSIFIED_STATS, SETTING_CLASSIFIED_DAYS, SETTING_ADS_APPROVAL } from '@/lib/settings';
import { approvePromo, rejectPromo, deletePromo, createPromoPackage, updatePromoPackage, deletePromoPackage } from '@/lib/promos';
import { createBackup, restoreBackup, deleteBackup } from '@/lib/backup';
import { MSG_KEYS, toLocalSaudi, sendNewPasswordToUser } from '@/lib/sms';
import { hashPassword } from '@/lib/auth';
import { cacheDel } from '@/lib/redis';
import { toInt } from '@/lib/utils';

function readPromoPkgForm(formData: FormData) {
  return {
    name: String(formData.get('name') || '').trim() || 'باقة',
    days: Math.max(1, parseInt(String(formData.get('days') || '30')) || 30),
    price: Math.max(0, parseFloat(String(formData.get('price') || '0')) || 0),
    sort: parseInt(String(formData.get('sort') || '0')) || 0,
    active: formData.get('active') !== null,
  };
}

export async function approvePromoAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await approvePromo(id);
  revalidatePath('/admin/promos');
}
export async function rejectPromoAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await rejectPromo(id);
  revalidatePath('/admin/promos');
}
export async function deletePromoAction(formData: FormData) {
  await requireAction('promos', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePromo(id);
  revalidatePath('/admin/promos');
}
export async function createPromoPackageAction(formData: FormData) {
  await requireAction('promos', 'add');
  await createPromoPackage(readPromoPkgForm(formData));
  revalidatePath('/admin/promos/packages');
  revalidatePath('/promote');
}
export async function updatePromoPackageAction(formData: FormData) {
  await requireAction('promos', 'edit');
  const id = Number(formData.get('id'));
  if (id) await updatePromoPackage(id, readPromoPkgForm(formData));
  revalidatePath('/admin/promos/packages');
  revalidatePath('/promote');
}
export async function deletePromoPackageAction(formData: FormData) {
  await requireAction('promos', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePromoPackage(id);
  revalidatePath('/admin/promos/packages');
  revalidatePath('/promote');
}

function readPackageForm(formData: FormData) {
  const t = String(formData.get('tier') || '');
  return {
    name: String(formData.get('name') || '').trim() || 'باقة',
    price: Math.max(0, parseFloat(String(formData.get('price') || '0')) || 0),
    adsPerDay: Math.max(0, parseInt(String(formData.get('adsPerDay') || '0')) || 0),
    gapHours: Math.max(0, parseInt(String(formData.get('gapHours') || '0')) || 0),
    featuredSlots: Math.max(0, parseInt(String(formData.get('featuredSlots') || '0')) || 0),
    featuredDays: Math.max(0, parseInt(String(formData.get('featuredDays') || '0')) || 0),
    adDays: Math.max(0, parseInt(String(formData.get('adDays') || '0')) || 0),
    tier: (t === 'gold' || t === 'silver' ? t : '') as Tier,
    isDefault: !!formData.get('isDefault'),
    sort: parseInt(String(formData.get('sort') || '0')) || 0,
    active: formData.get('active') !== null,
  };
}

export async function createPackageAction(formData: FormData) {
  await requireAction('packages', 'add');
  await createPackage(readPackageForm(formData));
  revalidatePath('/admin/packages');
  revalidatePath('/packages');
}

export async function updatePackageAction(formData: FormData) {
  await requireAction('packages', 'edit');
  const id = Number(formData.get('id'));
  if (id) await updatePackage(id, readPackageForm(formData));
  revalidatePath('/admin/packages');
  revalidatePath('/packages');
}

export async function deletePackageAction(formData: FormData) {
  await requireAction('packages', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deletePackage(id);
  revalidatePath('/admin/packages');
  revalidatePath('/packages');
}

export async function assignUserPackageAction(formData: FormData) {
  await requireAction('packages', 'edit');
  const userId = Number(formData.get('userId'));
  const packageId = Number(formData.get('packageId')) || 0;
  const days = parseInt(String(formData.get('days') || '0')) || 0;
  if (userId) await assignUserPackage(userId, packageId, days);
  revalidatePath('/admin/users');
}

export async function addBannedWordAction(formData: FormData) {
  await requireAction('words', 'add');
  const word = String(formData.get('word') || '').trim();
  if (word) await addBannedWord(word);
  revalidatePath('/admin/words');
}

export async function deleteBannedWordAction(formData: FormData) {
  await requireAction('words', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteBannedWord(id);
  revalidatePath('/admin/words');
}

export async function addGuardWordAction(formData: FormData) {
  await requireAction('words', 'add');
  const category = String(formData.get('category') || '') as GuardCategory;
  const word = String(formData.get('word') || '').trim();
  if (word && GUARD_CATEGORIES.includes(category)) await addGuardWord(category, word);
  revalidatePath('/admin/guard-words');
}

export async function deleteGuardWordAction(formData: FormData) {
  await requireAction('words', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteGuardWord(id);
  revalidatePath('/admin/guard-words');
}

export async function adminDeleteClassifiedAction(formData: FormData) {
  await requireAction('classified', 'delete');
  const id = Number(formData.get('id'));
  if (id) await deleteClassified(id);
  revalidatePath('/admin/classified');
  revalidatePath('/classified');
}

/** Delete an ad from its detail page (admin), then go home. */
export async function adminDeleteAdRedirectAction(formData: FormData) {
  await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  redirect('/');
}

/** Archive (hide) an ad from its detail page (admin). Auto-deleted after 30 days. */
export async function adminArchiveAdAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) {
    const archiving = a.status === 1;
    await prisma.ads.update({
      where: { id },
      data: { status: archiving ? 0 : 1, data_archive: archiving ? new Date().toISOString() : null },
    }).catch(() => {});
  }
  revalidatePath(`/ads/${toInt(id)}`);
}

/** Ban/unban the seller from the ad detail page (admin). */
export async function adminBanSellerAction(formData: FormData) {
  await requireAction('users', 'edit');
  const uid = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id: uid } });
  if (u) await prisma.users.update({ where: { id: uid }, data: { ban: u.ban === 'checked' ? 'no' : 'checked' } });
  const adId = String(formData.get('adId') || '');
  if (adId) revalidatePath(`/ads/${adId}`);
}

export async function adminDeleteDuplicatesAction() {
  await requireAction('duplicates', 'delete');
  const { groups } = await findDuplicateAds();
  const dupIds = groups.flatMap((g) => g.dups.map((d) => BigInt(d.id)));
  let deleted = 0;
  for (const id of dupIds) {
    await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
    const ok = await prisma.ads.delete({ where: { id } }).then(() => true).catch(() => false);
    if (ok) deleted++;
  }
  revalidatePath('/admin/ads');
  revalidatePath('/admin/duplicates');
  redirect(`/admin/duplicates?deleted=${deleted}`);
}

export async function banUserAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { ban: u.ban === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/users');
}

/** Save a user's granular permissions from the permissions matrix (checkboxes named perm[]). */
export async function setUserPermsAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = Number(formData.get('userId'));
  if (!id) redirect('/admin/users');
  const keys = formData.getAll('perm').map((v) => String(v)).filter((k) => ALL_KEYS.includes(k));
  await setUserPerms(id, keys);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${id}/permissions?saved=1`);
}

/** Apply a quick role preset (manager/moderator/monitor/none) to a user. */
export async function applyPresetAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = Number(formData.get('userId'));
  const role = String(formData.get('role') || 'none') as Role | 'none';
  if (id) await applyRolePreset(id, role);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${id}/permissions?saved=1`);
}

/** Save the member self-service windows (edit/delete allowed period, hours). */
export async function saveSettingsAction(formData: FormData) {
  await requireAction('users', 'edit');
  const editH = Math.max(0, parseInt(String(formData.get('editHours') || '0')) || 0);
  const delH = Math.max(0, parseInt(String(formData.get('deleteHours') || '0')) || 0);
  const homeStats = HOME_STAT_KEYS.filter((k) => formData.get(`stat_${k}`) !== null).join(',');
  const cs = String(formData.get('classifiedStats') || 'owner');
  const classifiedStats = ['all', 'owner', 'admin'].includes(cs) ? cs : 'owner';
  const classifiedDays = Math.max(0, parseInt(String(formData.get('classifiedDays') || '0')) || 0);
  const adsApproval = formData.get('adsApproval') !== null ? '1' : '0';
  await setSetting(SETTING_ADS_APPROVAL, adsApproval);
  await setSetting(SETTING_AD_EDIT_HOURS, String(editH));
  await setSetting(SETTING_AD_DELETE_HOURS, String(delH));
  await setSetting(SETTING_HOME_STATS, homeStats);
  await setSetting(SETTING_CLASSIFIED_STATS, classifiedStats);
  await setSetting(SETTING_CLASSIFIED_DAYS, String(classifiedDays));
  revalidatePath('/admin/settings');
  revalidatePath('/');
  revalidatePath('/classified');
  redirect('/admin/settings?saved=1');
}

/** Save the permission matrix for one role (checkbox keys named "k"). */
export async function saveRolePermsAction(formData: FormData) {
  await requireAction('users', 'edit');
  const role = String(formData.get('role') || '') as Role;
  if (!MATRIX_ROLES.includes(role)) return;
  const keys = formData.getAll('k').map((v) => String(v));
  await setRolePermKeys(role, keys);
  revalidatePath('/admin/roles');
  redirect(`/admin/roles?saved=${role}`);
}

/** Save messaging/verification gateway settings (SMS + WhatsApp). */
export async function saveVerificationAction(formData: FormData) {
  await requireAction('users', 'edit');
  const s = (k: string) => String(formData.get(k) || '').trim();
  const ch = s('channel');
  const channel = ch === 'whatsapp' || ch === 'both' ? ch : 'sms';
  const provider = s('sms_provider') === 'legacy' ? 'legacy' : 'jawaly_v1';
  const defUrl = provider === 'legacy' ? '' : 'https://api-sms.4jawaly.com/api/v1/account/area/sms/send';
  await Promise.all([
    setSetting(MSG_KEYS.smsProvider, provider),
    setSetting(MSG_KEYS.smsUrl, s('sms_url') || defUrl),
    setSetting(MSG_KEYS.smsUser, s('sms_username')),
    setSetting(MSG_KEYS.smsPass, s('sms_password')),
    setSetting(MSG_KEYS.smsSender, s('sms_sender') || 'SouqAlhafta'),
    setSetting(MSG_KEYS.smsUnicode, s('sms_unicode') || 'e'),
    setSetting(MSG_KEYS.waUrl, s('wa_url') || 'https://user.4whats.net/api/sendMessage'),
    setSetting(MSG_KEYS.waInstance, s('wa_instance')),
    setSetting(MSG_KEYS.waToken, s('wa_token')),
    setSetting(MSG_KEYS.channel, channel),
    setSetting(MSG_KEYS.enabled, formData.get('enabled') !== null ? '1' : '0'),
  ]);
  revalidatePath('/admin/verification');
  redirect('/admin/verification?saved=1');
}

/* ---- Database backup / restore ---- */
const errUrl = (msg: string) => `/admin/backup?error=${encodeURIComponent(msg).slice(0, 200)}`;

export async function createBackupAction() {
  await requireAction('backup', 'add');
  let dest = '/admin/backup?done=backup';
  try {
    const name = await createBackup();
    dest = `/admin/backup?done=backup&name=${encodeURIComponent(name)}`;
  } catch (e) {
    dest = errUrl(e instanceof Error ? e.message : 'فشل إنشاء النسخة');
  }
  revalidatePath('/admin/backup');
  redirect(dest);
}

export async function deleteBackupAction(formData: FormData) {
  await requireAction('backup', 'delete');
  const name = String(formData.get('name') || '');
  let dest = '/admin/backup?done=deleted';
  try {
    await deleteBackup(name);
  } catch (e) {
    dest = errUrl(e instanceof Error ? e.message : 'فشل الحذف');
  }
  revalidatePath('/admin/backup');
  redirect(dest);
}

export async function restoreBackupAction(formData: FormData) {
  await requireAction('backup', 'edit');
  const name = String(formData.get('name') || '');
  const confirm = String(formData.get('confirm') || '').trim();
  const agree = formData.get('agree') !== null;
  let dest: string;
  if (!agree || confirm !== 'استعادة') {
    dest = errUrl('لم تُؤكّد الاستعادة بشكل صحيح — يجب كتابة كلمة «استعادة» وتعليم الإقرار.');
  } else {
    try {
      const { safety } = await restoreBackup(name);
      dest = `/admin/backup?done=restore&name=${encodeURIComponent(name)}&safety=${encodeURIComponent(safety)}`;
    } catch (e) {
      dest = errUrl(e instanceof Error ? e.message : 'فشلت الاستعادة');
    }
  }
  revalidatePath('/admin/backup');
  redirect(dest);
}

export async function trustUserAction(formData: FormData) {
  await requireAction('verifications', 'edit');
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { trusted: u.trusted === 1 ? 0 : 1, step: 0 } });
  revalidatePath('/admin/users');
  revalidatePath('/admin/verifications');
}

export async function adminDeleteAdAction(formData: FormData) {
  await requireAction('ads', 'delete');
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } });
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/ads');
}

export async function adminToggleSpecialAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { adsSpecial: a.adsSpecial === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/ads');
}

export async function adminToggleAdStatusAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) {
    const archiving = a.status === 1; // hiding => archive (stamp date); showing => clear
    await prisma.ads.update({
      where: { id },
      data: { status: archiving ? 0 : 1, data_archive: archiving ? new Date().toISOString() : null },
    });
  }
  revalidatePath('/admin/ads');
}

/** Delete ALL ads that are waiting for approval (status 0, not archived). */
export async function deleteAllPendingAdsAction() {
  await requireAction('ads', 'delete');
  const pend = await prisma.ads.findMany({
    where: { status: 0, OR: [{ data_archive: null }, { data_archive: '' }] },
    select: { id: true },
  });
  const ids = pend.map((p) => p.id);
  if (ids.length) {
    await prisma.photos.deleteMany({ where: { other_id: { in: ids } } }).catch(() => {});
    await prisma.ads.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  revalidatePath('/admin/ads');
}

async function refreshCategories() {
  await cacheDel('categories:active');
  revalidatePath('/admin/categories');
  revalidatePath('/');
}

export async function addCategoryAction(formData: FormData) {
  await requireAction('categories', 'add');
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const ordered = parseInt(String(formData.get('ordered') || '0')) || 0;
  await prisma.categories.create({ data: { name, photo_path: '0', is_active: 'yes', ordered } });
  await refreshCategories();
}

export async function toggleCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const c = await prisma.categories.findUnique({ where: { id } });
  if (c) await prisma.categories.update({ where: { id }, data: { is_active: c.is_active === 'yes' ? 'no' : 'yes' } });
  await refreshCategories();
}

export async function updateCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const name = String(formData.get('name') || '').trim();
  const ordered = parseInt(String(formData.get('ordered') || '0')) || 0;
  if (name) await prisma.categories.update({ where: { id }, data: { name, ordered } }).catch(() => {});
  await refreshCategories();
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAction('categories', 'delete');
  const id = BigInt(String(formData.get('catId')));
  await prisma.categories.delete({ where: { id } }).catch(() => {});
  await refreshCategories();
}

export async function moveCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const dir = String(formData.get('dir')); // 'up' | 'down'
  const cats = await prisma.categories.findMany({ orderBy: [{ ordered: 'desc' }, { id: 'desc' }], select: { id: true } });
  const ids = cats.map((c) => c.id);
  const idx = ids.findIndex((x) => x === id);
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (idx >= 0 && swap >= 0 && swap < ids.length) {
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    const n = ids.length;
    for (let i = 0; i < n; i++) await prisma.categories.update({ where: { id: ids[i] }, data: { ordered: n - i } }).catch(() => {});
  }
  await refreshCategories();
}

/* ---- User view / edit / send-password ---- */
export async function updateUserAction(formData: FormData) {
  await requireAction('users', 'edit');
  const id = BigInt(String(formData.get('userId')));
  const uid = toInt(id);
  const name = String(formData.get('name') || '').trim();
  const phoneRaw = String(formData.get('phoneNumber') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const data: { name?: string; phoneNumber?: string; email?: string | null } = {};
  if (name) data.name = name;
  if (phoneRaw) data.phoneNumber = toLocalSaudi(phoneRaw);
  data.email = email || null;
  await prisma.users.update({ where: { id }, data }).catch(() => {});
  revalidatePath(`/admin/users/${uid}`);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${uid}?saved=1`);
}

export async function sendUserPasswordAction(formData: FormData) {
  await requireAction('users', 'edit');
  const uid = Number(formData.get('userId'));
  const r = await sendNewPasswordToUser(uid);
  redirect(`/admin/users/${uid}?${r.ok ? 'sent=1' : 'error=' + encodeURIComponent(r.error || 'فشل الإرسال')}`);
}

export async function setUserPasswordAction(formData: FormData) {
  await requireAction('users', 'edit');
  const uid = Number(formData.get('userId'));
  const pass = String(formData.get('password') || '');
  if (pass.length < 6) redirect(`/admin/users/${uid}?error=${encodeURIComponent('كلمة المرور 6 أحرف على الأقل')}`);
  await prisma.users.update({ where: { id: BigInt(uid) }, data: { password: await hashPassword(pass) } }).catch(() => {});
  redirect(`/admin/users/${uid}?setpass=1`);
}
