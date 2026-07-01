'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { toInt } from '@/lib/utils';

async function storeImages(files: File[], userId: number, adId: bigint) {
  let order = 0;
  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (file.size > 8 * 1024 * 1024) continue; // 8MB cap
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safe = `${Date.now()}_${Math.floor(order)}_${Math.abs(hashName(file.name))}.${ext}`;
    order += 1;
    const buf = Buffer.from(await file.arrayBuffer());
    const rel = await saveUpload(buf, safe);
    const up = await prisma.uploads.create({
      data: { file_name: rel, file_original_name: file.name, extension: ext, type: 'ad', file_size: file.size, user_id: userId },
    });
    await prisma.photos.create({ data: { photo_path: String(toInt(up.id)), other_id: adId } });
  }
}

function hashName(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function createAdAction(formData: FormData) {
  const session = await requireUser();
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) } });

  const title = String(formData.get('title') || '').trim();
  const detail = String(formData.get('detail') || '').trim();
  const price = parseFloat(String(formData.get('price') || '0')) || 0;
  const adsType = String(formData.get('adsType')) === 'request' ? 'request' : 'offer';
  const category_id = BigInt(String(formData.get('category_id') || '0'));
  const subRaw = String(formData.get('subcategory_id') || '');
  const cityId = String(formData.get('city_id') || '0');
  const countryRaw = String(formData.get('country_id') || '');
  if (!title || !detail || !category_id) return;

  const ad = await prisma.ads.create({
    data: {
      title, detail, price, adsType,
      category_id,
      subcategory_id: subRaw ? Number(subRaw) : null,
      city_id: BigInt(cityId || '0'),
      country_id: countryRaw ? Number(countryRaw) : (user?.country_id ?? null),
      user_id: BigInt(session.uid),
      video_path: '',
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
      adsSpecial: 'no',
      state: 'active',
      status: 1,
    },
  });

  const files = formData.getAll('images').filter((f): f is File => f instanceof File);
  await storeImages(files, session.uid, ad.id);

  redirect(`/ads/${toInt(ad.id)}`);
}

export async function updateAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');

  await prisma.ads.update({
    where: { id: adId },
    data: {
      title: String(formData.get('title') || '').trim(),
      detail: String(formData.get('detail') || '').trim(),
      price: parseFloat(String(formData.get('price') || '0')) || 0,
      adsType: String(formData.get('adsType')) === 'request' ? 'request' : 'offer',
      category_id: BigInt(String(formData.get('category_id') || '0')),
      subcategory_id: formData.get('subcategory_id') ? Number(formData.get('subcategory_id')) : null,
      city_id: BigInt(String(formData.get('city_id') || '0')),
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
    },
  });

  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length) await storeImages(files, session.uid, adId);

  revalidatePath(`/ads/${toInt(adId)}`);
  redirect(`/ads/${toInt(adId)}`);
}
