'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAction, setUserPerms, applyRolePreset, ALL_KEYS, type Role } from '@/lib/roles';
import { findDuplicateAds } from '@/lib/duplicates';
import { deleteClassified } from '@/lib/classified';
import { addBannedWord, deleteBannedWord } from '@/lib/censor';
import { createPackage, updatePackage, deletePackage, assignUserPackage, type Tier } from '@/lib/packages';
import { setSetting, SETTING_AD_EDIT_HOURS, SETTING_AD_DELETE_HOURS } from '@/lib/settings';
import { toInt } from '@/lib/utils';

function readPackageForm(formData: FormData) {
  const t = String(formData.get('tier') || '');
  return {
    name: String(formData.get('name') || '').trim() || 'باقة',
    price: Math.max(0, parseFloat(String(formData.get('price') || '0')) || 0),
    adsPerDay: Math.max(0, parseInt(String(formData.get('adsPerDay') || '0')) || 0),
    gapHours: Math.max(0, parseInt(String(formData.get('gapHours') || '0')) || 0),
    featuredSlots: Math.max(0, parseInt(String(formData.get('featuredSlots') || '0')) || 0),
    featuredDays: Math.max(0, parseInt(String(formData.get('featuredDays') || '0')) || 0),
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

/** Archive (hide) an ad from its detail page (admin). */
export async function adminArchiveAdAction(formData: FormData) {
  await requireAction('ads', 'archive');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { status: a.status === 1 ? 0 : 1 } }).catch(() => {});
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
  await setSetting(SETTING_AD_EDIT_HOURS, String(editH));
  await setSetting(SETTING_AD_DELETE_HOURS, String(delH));
  revalidatePath('/admin/settings');
  redirect('/admin/settings?saved=1');
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
  if (a) await prisma.ads.update({ where: { id }, data: { status: a.status === 1 ? 0 : 1 } });
  revalidatePath('/admin/ads');
}

export async function addCategoryAction(formData: FormData) {
  await requireAction('categories', 'add');
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  await prisma.categories.create({ data: { name, photo_path: '0', is_active: 'yes', ordered: 0 } });
  revalidatePath('/admin/categories');
}

export async function toggleCategoryAction(formData: FormData) {
  await requireAction('categories', 'edit');
  const id = BigInt(String(formData.get('catId')));
  const c = await prisma.categories.findUnique({ where: { id } });
  if (c) await prisma.categories.update({ where: { id }, data: { is_active: c.is_active === 'yes' ? 'no' : 'yes' } });
  revalidatePath('/admin/categories');
}
