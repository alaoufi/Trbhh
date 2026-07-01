'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';
import { toInt } from '@/lib/utils';

export async function banUserAction(formData: FormData) {
  await requireAdmin();
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { ban: u.ban === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/users');
}

export async function trustUserAction(formData: FormData) {
  await requireAdmin();
  const id = BigInt(String(formData.get('userId')));
  const u = await prisma.users.findUnique({ where: { id } });
  if (u) await prisma.users.update({ where: { id }, data: { trusted: u.trusted === 1 ? 0 : 1, step: 0 } });
  revalidatePath('/admin/users');
  revalidatePath('/admin/verifications');
}

export async function adminDeleteAdAction(formData: FormData) {
  await requireAdmin();
  const id = BigInt(String(formData.get('adId')));
  await prisma.photos.deleteMany({ where: { other_id: id } });
  await prisma.ads.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/ads');
}

export async function adminToggleSpecialAction(formData: FormData) {
  await requireAdmin();
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { adsSpecial: a.adsSpecial === 'checked' ? 'no' : 'checked' } });
  revalidatePath('/admin/ads');
}

export async function adminToggleAdStatusAction(formData: FormData) {
  await requireAdmin();
  const id = BigInt(String(formData.get('adId')));
  const a = await prisma.ads.findUnique({ where: { id } });
  if (a) await prisma.ads.update({ where: { id }, data: { status: a.status === 1 ? 0 : 1 } });
  revalidatePath('/admin/ads');
}

export async function addCategoryAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  await prisma.categories.create({ data: { name, photo_path: '0', is_active: 'yes', ordered: 0 } });
  revalidatePath('/admin/categories');
}

export async function toggleCategoryAction(formData: FormData) {
  await requireAdmin();
  const id = BigInt(String(formData.get('catId')));
  const c = await prisma.categories.findUnique({ where: { id } });
  if (c) await prisma.categories.update({ where: { id }, data: { is_active: c.is_active === 'yes' ? 'no' : 'yes' } });
  revalidatePath('/admin/categories');
}
