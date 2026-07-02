'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePerm, setUserRole, type Role } from '@/lib/roles';
import { findDuplicateAds } from '@/lib/duplicates';
import { deleteClassified } from '@/lib/classified';
import { addBannedWord, deleteBannedWord } from '@/lib/censor';
import { toInt } from '@/lib/utils';

export async function addBannedWordAction(formData: FormData) {
  await requirePerm('words');
  const word = String(formData.get('word') || '').trim();
  if (word) await addBannedWord(word);
  revalidatePath('/admin/words');
}

export async function deleteBannedWordAction(formData: FormData) {
  await requirePerm('words');
  const id = Number(formData.get('id'));
  if (id) await deleteBannedWord(id);
  revalidatePath('/admin/words');
}

export async function adminDeleteClassifiedAction(formData: FormData) {
  await requirePerm('classified');
  const id = Number(formData.get('id'));
  if (id) await deleteClassified(id);
  revalidatePath('/admin/classified');
  revalidatePath('/classified');
}

/** Delete an ad from its detail page (admin), then go home. */
export async function adminDeleteAdRedirectAction(formData: FormData) {
  await requirePerm('ads');
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } }).catch(() => {});
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  redirect('/');
}

/** Archive (hide) an ad from its detail page (admin). */
export async function adminArchiveAdAction(formData: FormData) {
  await requirePerm('ads');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { status: a.status === 1 ? 0 : 1 } }).catch(() => {});
  revalidatePath(`/ads/${toInt(id)}`);
}

/** Ban/unban the seller from the ad detail page (admin). */
export async function adminBanSellerAction(formData: FormData) {
  await requirePerm('ads');
  const uid = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id: uid } });
  if (u) await prisma.users.update({ where: { id: uid }, data: { ban: u.ban === 'checked' ? 'no' : 'checked' } });
  const adId = String(formData.get('adId') || '');
  if (adId) revalidatePath(`/ads/${adId}`);
}

export async function adminDeleteDuplicatesAction() {
  await requirePerm('duplicates');
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
  await requirePerm('users');
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { ban: u.ban === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/users');
}

export async function setUserRoleAction(formData: FormData) {
  await requirePerm('users');
  const id = Number(formData.get('userId'));
  const role = String(formData.get('role') || 'none') as Role | 'none';
  if (id) await setUserRole(id, role);
  revalidatePath('/admin/users');
}

export async function trustUserAction(formData: FormData) {
  await requirePerm('verifications');
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { trusted: u.trusted === 1 ? 0 : 1, step: 0 } });
  revalidatePath('/admin/users');
  revalidatePath('/admin/verifications');
}

export async function adminDeleteAdAction(formData: FormData) {
  await requirePerm('ads');
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } });
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/ads');
}

export async function adminToggleSpecialAction(formData: FormData) {
  await requirePerm('ads');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { adsSpecial: a.adsSpecial === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/ads');
}

export async function adminToggleAdStatusAction(formData: FormData) {
  await requirePerm('ads');
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { status: a.status === 1 ? 0 : 1 } });
  revalidatePath('/admin/ads');
}

export async function addCategoryAction(formData: FormData) {
  await requirePerm('categories');
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  await prisma.categories.create({ data: { name, photo_path: '0', is_active: 'yes', ordered: 0 } });
  revalidatePath('/admin/categories');
}

export async function toggleCategoryAction(formData: FormData) {
  await requirePerm('categories');
  const id = BigInt(String(formData.get('catId')));
  const c = await prisma.categories.findUnique({ where: { id } });
  if (c) await prisma.categories.update({ where: { id }, data: { is_active: c.is_active === 'yes' ? 'no' : 'yes' } });
  revalidatePath('/admin/categories');
}
