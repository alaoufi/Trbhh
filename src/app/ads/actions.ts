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

/** Normalize Arabic text for duplicate comparison. */
function normalizeAr(s: string): string {
  return s
    .replace(/[ً-ٰٟ]/g, '') // diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation/emoji
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Token-overlap (Jaccard) similarity between two normalized strings. */
function similarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Smart duplicate detection: same user posting a near-identical ad. */
async function isDuplicateAd(userId: number, title: string, detail: string, categoryId: bigint): Promise<boolean> {
  const recent = await prisma.ads.findMany({
    where: { user_id: BigInt(userId), status: 1 },
    select: { title: true, detail: true, category_id: true },
    orderBy: { id: 'desc' },
    take: 60,
  });
  const nTitle = normalizeAr(title);
  const nDetail = normalizeAr(detail);
  for (const r of recent) {
    const tSim = similarity(nTitle, normalizeAr(r.title));
    const dSim = similarity(nDetail, normalizeAr(r.detail));
    const sameCat = toInt(r.category_id) === toInt(categoryId);
    // exact title, or very similar title, or (similar title + similar body in same category)
    if (nTitle === normalizeAr(r.title)) return true;
    if (tSim >= 0.85) return true;
    if (sameCat && tSim >= 0.6 && dSim >= 0.7) return true;
  }
  return false;
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

  // smart duplicate guard
  if (await isDuplicateAd(session.uid, title, detail, category_id)) {
    redirect('/ads/new?dup=1');
  }

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
